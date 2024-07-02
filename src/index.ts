import { Context, MapString, Plugin, PluginInitParams, PublicAPI, Query, Result } from "@wox-launcher/wox-plugin"
import {
  auth,
  getCurrentlyPlaying,
  getDevices,
  isTokenValid,
  next,
  previous,
  updateAccessToken,
  updateAccessTokenByCode,
  updateAPI
} from "./spotify"
import { AccessToken, Track } from "@spotify/web-api-ts-sdk"

let api: PublicAPI

const listDevices = async (ctx: Context): Promise<Result[]> => {
  const devices = await getDevices()
  return devices.devices.map(device => {
    return {
      Title: device.name,
      SubTitle: device.type,
      Icon: {
        ImageType: "relative",
        ImageData: "images/app.png"
      },
      Actions: [
        {
          Name: "Play",
          Action: async () => {
            await api.Log(ctx, "Info", "play action")
          }
        }
      ]
    }
  })
}


export const plugin: Plugin = {
  init: async (ctx: Context, initParams: PluginInitParams) => {
    api = initParams.API
    updateAPI(api)

    await api.OnDeepLink(ctx, async (params: MapString) => {
      if (params.action === "spotify-auth") {
        await api.Log(ctx, "Info", "spotify auth deeplink received")
        const code = params.code || ""
        if (code === "") {
          await api.Log(ctx, "Error", "no code received")
          return
        }

        const resp = await updateAccessTokenByCode(code)
        await api.SaveSetting(ctx, "access_token", JSON.stringify(resp), false)
        await api.ChangeQuery(ctx, { QueryType: "input", QueryText: "spotify " })
        return
      }

      await api.Log(ctx, "Info", `unknown deeplink received, ${JSON.stringify(params)}`)
    })

    const token = await api.GetSetting(ctx, "access_token")
    if (token !== "") {
      const accessToken = JSON.parse(token) as AccessToken
      if (accessToken.access_token !== "") {
        await updateAccessToken(accessToken)
        return
      }
    }
  },

  query: async (ctx: Context, query: Query): Promise<Result[]> => {
    if (!isTokenValid() || query.Command == "auth") {
      return [
        {
          Title: "Authenticate",
          SubTitle: "select this to authenticate" + query.Search,
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

    if (query.Command == "devices") {
      return listDevices(ctx)
    }

    const current = await getCurrentlyPlaying()
    const itemTrack = current.item as Track
    return [
      {
        Title: `Current playing: ${current.item.name}`,
        SubTitle: `by ${itemTrack.artists.map(artist => artist.name).join(", ")}`,
        Icon: {
          ImageType: "relative",
          ImageData: "images/app.png"
        },
        Preview: {
          PreviewType: "markdown",
          PreviewData: `![${current.item.name}](${itemTrack.album.images[0].url})`,
          PreviewProperties: {
            "Album": itemTrack.album.name,
            "Release Date": itemTrack.album.release_date
          }
        }
      },
      {
        Title: "Next",
        Icon: {
          ImageType: "relative",
          ImageData: "images/app.png"
        },
        Actions: [
          {
            Name: "Next",
            Action: async () => {
              await next()
            }
          }
        ]
      },
      {
        Title: "Previous",
        Icon: {
          ImageType: "relative",
          ImageData: "images/app.png"
        },
        Actions: [
          {
            Name: "Previous",
            Action: async () => {
              await previous()
            }
          }
        ]
      }
    ]
  }
}
