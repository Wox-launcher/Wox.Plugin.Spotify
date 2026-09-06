import type { Context, MapString, PluginInitParams, PublicAPI } from "@wox-launcher/wox-plugin"
import { readFileSync } from "fs"
import path from "path"
import { plugin } from "../index"
import { clearAccessToken, startRefreshTokenScheduler, updateAccessTokenByCode } from "../spotify"

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
  clearAccessToken: jest.fn(),
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
    SaveSetting: jest.fn().mockResolvedValue(undefined),
    OnSettingChanged: jest.fn().mockResolvedValue(undefined),
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

test("requires Spotify client ID before any query", () => {
  const metadata = JSON.parse(readFileSync(path.join(__dirname, "../../plugin.json"), "utf8"))

  expect(metadata.MinWoxVersion).toBe("2.0.3")
  expect(metadata.QueryRequirements).toEqual({
    AnyQuery: [
      {
        SettingKey: "clientId",
        Validators: [{ Type: "not_empty" }],
        Message: "Spotify Client ID is required. Create a Spotify app and paste its Client ID in this plugin's settings."
      }
    ]
  })
})

test("clears stored token when Spotify client ID changes", async () => {
  const api = makeAPI()
  const initParams: PluginInitParams = { API: api, PluginDirectory: "/tmp/plugin" }

  await plugin.init(makeContext({ traceId: "init-trace" }), initParams)
  const callback = api.OnSettingChanged.mock.calls[0][1] as (ctx: Context, key: string, value: string) => Promise<void>

  await callback(makeContext({ traceId: "setting-trace" }), "clientId", "new-client-id")

  expect(clearAccessToken).toHaveBeenCalled()
  expect(api.SaveSetting).toHaveBeenCalledWith(expect.anything(), "access_token", "", false)
})
