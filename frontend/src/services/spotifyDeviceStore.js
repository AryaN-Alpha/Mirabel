// Last-known active Spotify device id, kept in sync by SpotifyNowPlayingBar's
// existing poll (mounted once, globally, per its own doc comment). Lets every
// "Play" button across the Spotify tabs target the real active device instead
// of omitting device_id and relying on Spotify's own "current active device"
// guess, which is unreliable across multiple devices/sessions — without any
// extra network round trip per click.
let activeDeviceId = null;

export function setActiveSpotifyDeviceId(deviceId) {
  activeDeviceId = deviceId || null;
}

export function getActiveSpotifyDeviceId() {
  return activeDeviceId;
}
