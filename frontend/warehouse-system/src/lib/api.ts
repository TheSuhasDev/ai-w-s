const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

export async function api<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem("token");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string>) || {}),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers,
    });
  } catch (error) {
    throw new Error(
      "Unable to reach the warehouse server. Check that the Express backend is running.",
      { cause: error },
    );
  }

  const data = await response.json().catch(() => ({}));

  if (response.status === 401) {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.dispatchEvent(new CustomEvent("wms-auth-401"));
    if (window.location.pathname !== "/login") {
      window.history.pushState({}, "", "/login");
      window.dispatchEvent(new PopStateEvent("popstate"));
    }
    const serverMessage = typeof data.message === "string" ? data.message : "";
    throw new Error(serverMessage || "Unauthorized. Please log in.");
  }

  if (!response.ok) {
    const serverMessage = typeof data.message === "string" ? data.message : "";
    throw new Error(serverMessage || "Warehouse request failed");
  }

  return data;
}

export default api;
