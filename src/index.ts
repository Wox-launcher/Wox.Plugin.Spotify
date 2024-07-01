import { Context, MapString, Plugin, PluginInitParams, PublicAPI, Query, Result } from "@wox-launcher/wox-plugin"
import { auth, isTokenValid, updateToken } from "./spotify"

let api: PublicAPI

export const plugin: Plugin = {
  init: async (ctx: Context, initParams: PluginInitParams) => {
    api = initParams.API
    await api.OnDeepLink(ctx, async (params: MapString) => {
      if (params.action === "spotify-auth") {
        await api.Log(ctx, "Info", "spotify auth deeplink received")
        const token = params.code || ""
        if (token === "") {
          await api.Log(ctx, "Error", "no token received")
          return
        }

        await api.SaveSetting(ctx, "token", token, false)
        updateToken(token)
        return
      }

      await api.Log(ctx, "Info", `unknown deeplink received, ${JSON.stringify(params)}`)
    })
  },

  query: async (ctx: Context, query: Query): Promise<Result[]> => {
    if (!isTokenValid()) {
      return [
        {
          Title: "you need to authenticate first",
          SubTitle: "select this to authenticate",
          Icon: {
            ImageType: "relative",
            ImageData: "images/app.png"
          },
          Actions: [
            {
              Name: "Auth",
              Action: async () => {
                await auth()
              }
            }
          ]
        }
      ]
    }

    return [
      {
        Title: "Hello World " + query.Search,
        SubTitle: "This is a subtitle",
        Icon: {
          ImageType: "relative",
          ImageData: "images/app.png"
        },
        Actions: [
          {
            Name: "Auth",
            Action: async () => {
              await auth()
            }
          }
        ]
      }
    ]
  }
}
