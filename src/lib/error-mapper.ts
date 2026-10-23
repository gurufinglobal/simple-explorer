
import { describeServiceMessage, serviceMessage, type MessageParams } from '@/i18n/service-message';
export type ErrorView = {
  code: string;
  message: string;
  params?: MessageParams;
};

export function mapToErrorView(error: unknown): ErrorView {
  const known = describeServiceMessage(error);
  if (known) return { code: known.messageCode, params: known.messageParams, message: known.message };
  if (error instanceof Error) {
    return {
      code: "UNEXPECTED_ERROR",
      message: error.message,
    };
  }

  return {
    code: "UNKNOWN_ERROR",
    ...serviceMessage("an_unknown_error_occurred"),
  };
}
