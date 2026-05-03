from django.test import SimpleTestCase

from memory.services.salience import calculate_salience, score_for_retrieval


class SalienceCalculationTests(SimpleTestCase):
    def test_trivial_message_scores_low(self):
        score = calculate_salience(text="ok lol", mood="neutral", role="user")
        self.assertLess(score, 0.20)

    def test_emotional_disclosure_scores_high(self):
        score = calculate_salience(
            text=(
                "I haven't slept in two days because of work "
                "and I feel like I'm drowning"
            ),
            mood="scolding",
            role="user",
        )
        # 0.30 baseline + 0.30 (scolding) + 0.08 (1 disclosure hit: "i feel") = 0.68
        self.assertGreater(score, 0.65)

    def test_high_emotion_mood_boosts_score(self):
        base = calculate_salience(text="something happened", mood="neutral", role="user")
        boosted = calculate_salience(text="something happened", mood="flustered", role="user")
        self.assertGreater(boosted, base)

    def test_assistant_gets_no_disclosure_bonus(self):
        user_score = calculate_salience(
            text="I feel really tired today", mood="neutral", role="user"
        )
        asst_score = calculate_salience(
            text="I feel really tired today", mood="neutral", role="assistant"
        )
        self.assertGreater(user_score, asst_score)

    def test_score_clamped_to_unit_interval(self):
        for mood in ("angry_concerned", "scolding", "flustered"):
            score = calculate_salience(
                text="my mom is sick and I lost my job and I'm exhausted "
                     "and I hate everything and I can't sleep",
                mood=mood,
                role="user",
            )
            self.assertLessEqual(score, 1.0)
            self.assertGreaterEqual(score, 0.0)


class RetrievalScoringOrderTests(SimpleTestCase):
    def test_high_salience_beats_low_salience_at_same_similarity(self):
        high = score_for_retrieval(similarity=0.8, salience=0.9, age_days=1)
        low = score_for_retrieval(similarity=0.8, salience=0.2, age_days=1)
        self.assertGreater(high, low)

    def test_recent_beats_old_at_same_similarity_and_salience(self):
        recent = score_for_retrieval(similarity=0.7, salience=0.5, age_days=1)
        old = score_for_retrieval(similarity=0.7, salience=0.5, age_days=180)
        self.assertGreater(recent, old)

    def test_high_similarity_old_vs_low_similarity_new(self):
        """
        High-similarity-but-old should still be competitive against
        low-similarity-but-new when salience is equal.
        """
        strong_old = score_for_retrieval(similarity=0.95, salience=0.5, age_days=60)
        weak_new = score_for_retrieval(similarity=0.30, salience=0.5, age_days=0)
        self.assertGreater(strong_old, weak_new)
