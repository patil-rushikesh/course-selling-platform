export function createApi(token, fetcher = fetch) {
  return async (path, { method = 'GET', body, headers = {}, signal } = {}) => {
    let response;
    try {
      response = await fetcher(`/api/v1${path}`, {
        method, signal,
        headers: { ...(body !== undefined && { 'Content-Type': 'application/json' }), ...(token && { Authorization: `Bearer ${token}` }), ...headers },
        ...(body !== undefined && { body: JSON.stringify(body) }),
      });
    } catch (error) {
      if (error.name === 'AbortError') throw error;
      throw new Error('Unable to connect to the server. Please try again.');
    }
    let data;
    try { data = await response.json(); }
    catch { throw new Error('The server returned an unexpected response. Please try again.'); }
    if (!response.ok) throw new Error(data.message || 'The request could not be completed.');
    return data;
  };
}
export function readSession(storage) {
  try {
    const value = JSON.parse(storage.getItem('course-session'));
    return value && typeof value.token === 'string' && value.token && ['user', 'admin'].includes(value.role) ? value : null;
  } catch { return null; }
}
