export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export function getApiErrorMessage(error, fallback) {
  if (error?.response) {
    return error.response.data?.message || fallback;
  }

  if (error?.request) {
    return `Cannot reach the API at ${API_URL}. Start the backend from the project folder with "npm start", then try again.`;
  }

  return error?.message || fallback;
}
