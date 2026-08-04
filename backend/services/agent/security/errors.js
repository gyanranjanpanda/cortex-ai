export const securityError = (status, message, code) => {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  error.data = { success: false, code, message };
  return error;
};
