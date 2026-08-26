import os
from datetime import timedelta

import msal
from django.conf import settings
from django.utils import timezone

from outlook.models import OutlookCredential

# offline_access is NOT listed here -- MSAL treats it as a reserved scope and
# adds it automatically to every request; passing it explicitly raises
# ValueError ("You cannot use any scope value that is reserved.").
SCOPES = ["Mail.Read", "Mail.Send", "User.Read"]

# Refresh this far ahead of actual expiry so a slow request never gets an
# access token that expires mid-flight.
_REFRESH_SKEW = timedelta(minutes=5)


class OutlookError(Exception):
    """Raised when Outlook OAuth/token handling can't complete."""


def _client_id() -> str:
    return os.environ.get("MS_CLIENT_ID", "")


def _client_secret() -> str:
    return os.environ.get("MS_CLIENT_SECRET", "")


def _require_client_credentials() -> tuple[str, str]:
    client_id = _client_id()
    client_secret = _client_secret()
    if not client_id or not client_secret:
        raise OutlookError("Microsoft Graph credentials aren't configured on the server.")
    return client_id, client_secret


def _msal_app() -> msal.ConfidentialClientApplication:
    client_id, client_secret = _require_client_credentials()
    authority = f"https://login.microsoftonline.com/{settings.MS_TENANT_ID}"
    return msal.ConfidentialClientApplication(
        client_id, client_credential=client_secret, authority=authority
    )


def get_auth_url(state: str) -> str:
    return _msal_app().get_authorization_request_url(
        SCOPES, state=state, redirect_uri=settings.MS_REDIRECT_URI
    )


def exchange_code_for_token(code: str) -> dict:
    result = _msal_app().acquire_token_by_authorization_code(
        code, scopes=SCOPES, redirect_uri=settings.MS_REDIRECT_URI
    )
    if "error" in result:
        raise OutlookError(result.get("error_description") or result["error"])
    return result


def _refresh(refresh_token: str) -> dict:
    result = _msal_app().acquire_token_by_refresh_token(refresh_token, scopes=SCOPES)
    if "error" in result:
        raise OutlookError(result.get("error_description") or result["error"])
    return result


def save_token_result(cred: OutlookCredential, result: dict) -> None:
    cred.set_access_token(result["access_token"])
    if result.get("refresh_token"):
        cred.set_refresh_token(result["refresh_token"])
    expires_in = int(result.get("expires_in", 3600))
    cred.token_expires_at = timezone.now() + timedelta(seconds=expires_in)


def get_valid_access_token() -> str:
    """The single place every Graph-calling function goes through.

    Loads the stored credential, refreshes it via MSAL if it's expired (or
    close to it) and saves the refreshed token back, then returns a
    ready-to-use access token. Mirrors get_api_key()'s role for LLM
    providers as the one centralized "is this usable right now" check.
    """
    cred = OutlookCredential.current()
    if not cred.is_connected:
        raise OutlookError("Outlook isn't connected.")

    needs_refresh = cred.token_expires_at is None or timezone.now() >= (
        cred.token_expires_at - _REFRESH_SKEW
    )
    if needs_refresh:
        result = _refresh(cred.get_refresh_token())
        save_token_result(cred, result)
        cred.save()

    return cred.get_access_token()
