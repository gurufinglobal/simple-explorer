export type ErrorView = {
  code: string;
  message: string;
};

export function mapToErrorView(error: unknown): ErrorView {
  if (error instanceof Error) {
    return {
      code: "UNEXPECTED_ERROR",
      message: error.message,
    };
  }

  return {
    code: "UNKNOWN_ERROR",
    message: "알 수 없는 오류가 발생했습니다.",
  };
}
