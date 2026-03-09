const acumaticaBaseUrl = process.env.ACUMATICA_BASE_URL;

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  error?: string;
  error_description?: string;
};

class AcumaticaService {
  public readonly baseUrl: string;
  private clientId: string;
  private clientSecret: string;
  private username: string;
  private password: string;

  private accessToken: string | null;
  private refreshToken: string | null;
  private tokenExpiry: number | null;

  constructor(
    baseUrl: string | undefined,
    clientId: string,
    clientSecret: string,
    username: string,
    password: string
  ) {
    this.baseUrl = baseUrl || acumaticaBaseUrl || "";
    if (!this.baseUrl) {
      throw new Error("ACUMATICA_BASE_URL is not set");
    }
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.username = username;
    this.password = password;
    this.accessToken = null;
    this.refreshToken = null;
    this.tokenExpiry = null;
  }

  async getToken(): Promise<string> {
    if (this.accessToken && this.tokenExpiry && this.tokenExpiry > Date.now()) {
      return this.accessToken;
    }

    const url = `${this.baseUrl}/identity/connect/token`;
    const body = new URLSearchParams({
      grant_type: this.refreshToken ? "refresh_token" : "password",
      client_id: this.clientId,
      client_secret: this.clientSecret,
    });

    if (this.refreshToken) {
      body.append("refresh_token", this.refreshToken);
    } else {
      body.append("username", this.username);
      body.append("password", this.password);
      body.append("scope", "api offline_access");
    }

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    const data = (await response.json()) as TokenResponse;

    if (!response.ok) {
      throw new Error(`Token request failed: ${data.error || data.error_description}`);
    }

    this.accessToken = data.access_token;
    this.refreshToken = data.refresh_token ?? null;
    this.tokenExpiry = Date.now() + data.expires_in * 1000;

    return this.accessToken;
  }
}

export default AcumaticaService;
