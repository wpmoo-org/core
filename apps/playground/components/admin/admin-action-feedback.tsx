import { type ActionFeedbackState, resolveActionFeedbackMessage, type Locale } from "../../lib/action-feedback";

type AdminActionFeedbackProps = Readonly<{
  locale: Locale;
  state: ActionFeedbackState;
}>;

export function AdminActionFeedback({
  locale,
  state
}: AdminActionFeedbackProps) {
  const message = resolveActionFeedbackMessage(state, locale);

  if (message === null) {
    return null;
  }

  return (
    <div
      role="status"
      className={`admin-action-feedback admin-action-feedback-${state.status}`}
    >
      {message}
    </div>
  );
}
