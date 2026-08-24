from services.review_prompt import MAX_DIFF_CHARS, build_review_messages


def test_build_review_messages_includes_diff():
    diff = "+added line\n-removed line"
    messages = build_review_messages(diff)
    assert len(messages) == 1
    assert diff in messages[0]["content"]
    assert messages[0]["role"] == "user"


def test_build_review_messages_truncates_long_diff():
    marker = "TRUNCATION_MARKER_SHOULD_NOT_APPEAR"
    long_diff = "a" * MAX_DIFF_CHARS + marker
    messages = build_review_messages(long_diff)
    content = messages[0]["content"]
    assert marker not in content
    assert "a" * 100 in content
