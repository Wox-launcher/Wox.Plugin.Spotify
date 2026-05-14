import type { Context, MapString, PluginInitParams, PublicAPI } from "@wox-launcher/wox-plugin"
import { plugin } from "../index"
import { startRefreshTokenScheduler, updateAccessTokenByCode } from "../spotify"

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

jest.mock("../spotify", () => ({
  activateDevice: jest.fn(),
  auth: jest.fn(),
  getCurrentUserInfo: jest.fn(),
  getCurrentlyPlaying: jest.fn(),
  getDevices: jest.fn(),
  getRecentlyPlayed: jest.fn(),
  getUserQueue: jest.fn(),
  isTokenValid: jest.fn(),
  next: jest.fn(),
  pause: jest.fn(),
  play: jest.fn(),
  previous: jest.fn(),
  resume: jest.fn(),
  search: jest.fn(),
  startRefreshTokenScheduler: jest.fn().mockResolvedValue(undefined),
  stopRefreshTokenScheduler: jest.fn(),
  updateAccessToken: jest.fn().mockResolvedValue(undefined),
  updateAccessTokenByCode: jest.fn().mockResolvedValue(undefined)
}))

type DeepLinkCallback = (ctx: Context, params: MapString) => Promise<void> | void

const makeContext = (values: MapString = {}): Context => ({
  Values: values,
  Get: (key: string) => values[key],
  Set: (key: string, value: string) => {
    values[key] = value
  },
  Exists: (key: string) => Object.prototype.hasOwnProperty.call(values, key)
})

const makeAPI = () => {
  const api = {
    OnDeepLink: jest.fn().mockResolvedValue(undefined),
    GetSetting: jest.fn().mockResolvedValue(""),
    Log: jest.fn().mockResolvedValue(undefined),
    ShowApp: jest.fn().mockResolvedValue(undefined),
    ChangeQuery: jest.fn().mockResolvedValue(undefined),
    OnUnload: jest.fn().mockResolvedValue(undefined)
  }

  return api as typeof api & PublicAPI
}

test("handles Spotify auth deeplink arguments from the host callback", async () => {
  const api = makeAPI()
  const initParams: PluginInitParams = { API: api, PluginDirectory: "/tmp/plugin" }

  await plugin.init(makeContext({ traceId: "init-trace" }), initParams)
  const callback = api.OnDeepLink.mock.calls[0][1] as DeepLinkCallback

  await callback(makeContext({ traceId: "deeplink-trace" }), { action: "spotify-auth", code: "auth-code" })

  expect(startRefreshTokenScheduler).toHaveBeenCalledWith(api)
  expect(updateAccessTokenByCode).toHaveBeenCalledWith("auth-code")
  expect(api.ShowApp).toHaveBeenCalled()
  expect(api.ChangeQuery).toHaveBeenCalledWith(expect.anything(), { QueryType: "input", QueryText: "spotify " })
})
