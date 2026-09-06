import type { Context, PublicAPI } from "@wox-launcher/wox-plugin"
import axios from "axios"
import open from "open"
import { auth, startRefreshTokenScheduler, stopRefreshTokenScheduler, updateAccessTokenByCode } from "../spotify"

jest.mock("@wox-launcher/wox-plugin", () => ({
  NewContext: () => {
    const values: Record<string, string> = {}
    return {
      Values: values,
      Get: (key: string) => values[key],
      Set: (key: string, value: string) => {
        values[key] = value
      },
      Exists: (key: string) => Object.prototype.hasOwnProperty.call(values, key)
    }
  }
}))

jest.mock("axios", () => ({
  __esModule: true,
  default: {
    post: jest.fn()
  }
}))

jest.mock("open", () => ({
  __esModule: true,
  default: jest.fn().mockResolvedValue(undefined)
}))

jest.mock("@spotify/web-api-ts-sdk", () => ({
  SpotifyApi: {
    withAccessToken: jest.fn(() => ({ player: {} }))
  }
}))

const makeAPI = (settings: Record<string, string> = {}): PublicAPI => {
  return {
    GetSetting: jest.fn(async (_ctx: Context, key: string) => settings[key] ?? ""),
    SaveSetting: jest.fn().mockResolvedValue(undefined),
    Log: jest.fn().mockResolvedValue(undefined)
  } as unknown as PublicAPI
}

afterEach(() => {
  stopRefreshTokenScheduler()
  jest.clearAllMocks()
})

test("uses configured Spotify client ID when opening auth URL", async () => {
  const api = makeAPI({ clientId: "configured-client-id" })
  await startRefreshTokenScheduler(api)

  await auth()

  expect(open).toHaveBeenCalledTimes(1)
  const authUrl = new URL((open as jest.Mock).mock.calls[0][0])
  expect(authUrl.searchParams.get("client_id")).toBe("configured-client-id")
})

test("does not open auth URL without a configured Spotify client ID", async () => {
  const api = makeAPI()
  await startRefreshTokenScheduler(api)

  await auth()

  expect(open).not.toHaveBeenCalled()
  expect(api.Log).toHaveBeenCalledWith(expect.anything(), "Error", "Spotify client ID is not configured")
})

test("uses configured Spotify client ID when exchanging auth code", async () => {
  const api = makeAPI({ clientId: "configured-client-id" })
  ;(axios.post as jest.Mock).mockResolvedValue({
    data: {
      access_token: "access-token",
      expires_in: 3600,
      refresh_token: "refresh-token"
    }
  })
  await startRefreshTokenScheduler(api)

  await updateAccessTokenByCode("auth-code")

  expect(axios.post).toHaveBeenCalledTimes(1)
  expect((axios.post as jest.Mock).mock.calls[0][1].client_id).toBe("configured-client-id")
})
