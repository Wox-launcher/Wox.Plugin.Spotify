import { Context, MapString, NewContext, Plugin, PluginInitParams, PublicAPI, Query, Result, ResultTail, WoxPreview } from "@wox-launcher/wox-plugin"
import { activateDevice, auth, getCurrentlyPlaying, getCurrentUserInfo, getDevices, getRecentlyPlayed, getUserQueue, isTokenValid, next, pause, play, previous, resume, search, startRefreshTokenScheduler, updateAccessToken, updateAccessTokenByCode } from "./spotify"
import { AccessToken, Track } from "@spotify/web-api-ts-sdk"
import { activateImg, authImg, followOrLoveImg, nextImg, pauseImg, playingLottieJson, previousImg, resumeOrPlayImg } from "./asset"

let api: PublicAPI

const listDevices = async (ctx: Context, query: Query): Promise<Result[]> => {
  const devices = await getDevices()
  return devices.devices.map(device => {
    return {
      Title: device.name + (device.is_active ? " - Active" : ""),
      SubTitle: device.type,
      Icon: {
        ImageType: "relative",
        ImageData: "images/app.png"
      },
      Actions: [
        {
          Name: "Activate",
          Icon: activateImg,
          Action: async () => {
            if (!device.is_active && device.id) {
              await activateDevice(device.id)
              // wait 1 second for the device to be activated
              setTimeout(async () => {
                await api.ChangeQuery(ctx, { QueryType: "input", QueryText: query.RawQuery })
              }, 1000)
            }
          }
        }
      ]
    }
  })
}

const playing = async (): Promise<Result[]> => {
  const current = await getCurrentlyPlaying()
  if (current === null) {
    return me()
  }

  const itemTrack = current.item as Track
  const currentResult = {
    Title: `${current.item.name}`,
    SubTitle: `by ${itemTrack.artists.map(artist => artist.name).join(", ")}`,
    Icon: {
      ImageType: "relative",
      ImageData: "images/app.png"
    },
    Preview: getPreviewForTrack(itemTrack),
    Group: "Playing",
    GroupScore: 100,
    Tails: [
      {
        Type: "image",
        Image: playingLottieJson
      } as ResultTail
    ],
    Actions: [
      current.is_playing ? {
          Name: "Pause",
          Icon: pauseImg,
          Action: async () => {
            await pause()
          }
        } :
        {
          Name: "Resume",
          Icon: resumeOrPlayImg,
          Action: async () => {
            await resume()
          }
        },
      {
        Name: "Next",
        Icon: nextImg,
        Action: async () => {
          await next()
        }
      },
      {
        Name: "Previous",
        Icon: previousImg,
        Action: async () => {
          await previous()
        }
      }
    ]
  } as Result


  const queue = await getUserQueue()
  const queueResult = queue.queue.map(item => {
    const track = item as Track
    return {
      Title: track.name,
      SubTitle: `by ${track.artists.map(artist => artist.name).join(", ")}`,
      Icon: {
        ImageType: "relative",
        ImageData: "images/app.png"
      },
      Group: "Queue",
      GroupScore: 90,
      Preview: getPreviewForTrack(track),
      Actions: [
        {
          Name: "Play",
          Icon: resumeOrPlayImg,
          Action: async () => {
            await play(track.uri)
          }
        }
      ]
    } as Result
  })

  return [currentResult, ...queueResult]
}

const skipToNext = async (): Promise<Result[]> => {
  return [
    {
      Title: "Skip to next",
      Icon: {
        ImageType: "relative",
        ImageData: "images/app.png"
      },
      Actions: [
        {
          Name: "Next",
          Icon: nextImg,
          Action: async () => {
            await next()
          }
        }
      ]
    }
  ]
}

const skipToPrev = async (): Promise<Result[]> => {
  return [
    {
      Title: "Skip to previous",
      Icon: {
        ImageType: "relative",
        ImageData: "images/app.png"
      },
      Actions: [
        {
          Name: "Previous",
          Icon: previousImg,
          Action: async () => {
            await previous()
          }
        }
      ]
    }
  ]
}

const showRecent = async (): Promise<Result[]> => {
  const recent = await getRecentlyPlayed()
  return recent.items.map(item => {
    const track = item.track
    return {
      Title: track.name,
      SubTitle: `by ${track.artists.map(artist => artist.name).join(", ")}`,
      Icon: {
        ImageType: "relative",
        ImageData: "images/app.png"
      },
      Preview: getPreviewForTrack(track)
    }
  })
}

const showSearch = async (ctx: Context, query: Query): Promise<Result[]> => {
  if (query.Search === "") {
    return [
      {
        Title: "Search",
        SubTitle: "enter a search query",
        Icon: {
          ImageType: "relative",
          ImageData: "images/app.png"
        }
      }
    ]
  }

  let results = [] as Result[]
  const searchResults = await search(query.Search)

  if (searchResults.playlists) {
    results = results.concat(searchResults.playlists.items.slice(0, 5).map(item => {
        return {
          Title: item.name,
          Icon: {
            ImageType: "relative",
            ImageData: "images/app.png"
          },
          Group: "Playlists",
          GroupScore: 170,
          Preview: {
            PreviewType: "markdown",
            PreviewData: `${item.images.length > 0 ? `![${item.name}](${item.images[0].url})` : ""}`,
            PreviewProperties: {}
          },
          Actions: [
            {
              Name: "Play",
              Icon: resumeOrPlayImg,
              Action: async () => {
                await play(item.uri)
              }
            },
            {
              Name: "Follow",
              Icon: followOrLoveImg,
              Action: async () => {
                const user = await getCurrentUserInfo()
                await user.playlists.follow(item.id)
              }
            }
          ]
        }
      }
    ))
  }


  if (searchResults.artists) {
    results = results.concat(searchResults.artists.items.slice(0, 5).map(item => {
        return {
          Title: item.name,
          Icon: {
            ImageType: "relative",
            ImageData: "images/app.png"
          },
          Group: "Artists",
          GroupScore: 150,
          Preview: {
            PreviewType: "markdown",
            PreviewData: `${item.images.length > 0 ? `![${item.name}](${item.images[0].url})` : ""}`,
            PreviewProperties: {
              "Followers": `${item.followers.total}`,
              "Popularity": `${item.popularity}`
            }
          },
          Actions: [
            {
              Name: "Play",
              Icon: resumeOrPlayImg,
              Action: async () => {
                await play(item.uri)
              }
            },
            {
              Name: "Follow",
              Icon: followOrLoveImg,
              Action: async () => {
                const user = await getCurrentUserInfo()
                await user.followArtistsOrUsers([item.id], "artist")
              }
            }
          ]
        }
      }
    ))
  }


  if (searchResults.tracks) {
    results = results.concat(searchResults.tracks.items.slice(0, 5).map(item => {
        const track = item as Track
        return {
          Title: track.name,
          SubTitle: `by ${track.artists.map(artist => artist.name).join(", ")}`,
          Icon: {
            ImageType: "relative",
            ImageData: "images/app.png"
          },
          Group: "Tracks",
          GroupScore: 100,
          Preview: getPreviewForTrack(track),
          Actions: [
            {
              Name: "Play",
              Action: async () => {
                await play(track.uri)
              }
            }
          ]
        } as Result
      }
    ))
  }

  if (searchResults.albums) {
    results = results.concat(searchResults.albums.items.slice(0, 5).map(item => {
        return {
          Title: item.name,
          SubTitle: `by ${item.artists.map(artist => artist.name).join(", ")}`,
          Icon: {
            ImageType: "relative",
            ImageData: "images/app.png"
          },
          Group: "Albums",
          GroupScore: 90,
          Preview: {
            PreviewType: "markdown",
            PreviewData: `${item.images.length > 0 ? `![${item.name}](${item.images[0].url})` : ""}`,
            PreviewProperties: {}
          },
          Actions: [
            {
              Name: "Play",
              Action: async () => {
                await play(item.uri)
              }
            }
          ]
        }
      }
    ))
  }

  return results
}

const me = async (): Promise<Result[]> => {
  const current = await getCurrentUserInfo()

  let results = [] as Result[]

  const profile = await current.profile()
  results.push({
    Title: profile.display_name,
    Icon: {
      ImageType: "url",
      ImageData: profile.images.length > 0 ? profile.images[0].url : ""
    },
    Group: "User",
    GroupScore: 100,
    Preview: {
      PreviewType: "markdown",
      PreviewData: ``,
      PreviewProperties: {
        "UserId": profile.id,
        "Email": profile.email
      }
    }
  })

  //playlists
  const playlists = await current.playlists.playlists()
  const playlistResults = playlists.items.map(item => {
    return {
      Title: item.name,
      Icon: {
        ImageType: "relative",
        ImageData: "images/app.png"
      },
      Group: "Playlists",
      GroupScore: 90,
      Preview: {
        PreviewType: "markdown",
        PreviewData: `${item.images.length > 0 ? `![${item.name}](${item.images[0].url})` : ""}`,
        PreviewProperties: {}
      },
      Actions: [
        {
          Name: "Play",
          Icon: resumeOrPlayImg,
          Action: async () => {
            await play(item.uri)
          }
        }
      ]
    } as Result
  })
  results = results.concat(playlistResults)

  //artists
  const artists = await current.followedArtists()
  const artistResults = artists.artists.items.map(item => {
    return {
      Title: item.name,
      Icon: {
        ImageType: "relative",
        ImageData: "images/app.png"
      },
      Group: "Artists",
      GroupScore: 80,
      Score: item.popularity,
      Preview: {
        PreviewType: "markdown",
        PreviewData: `${item.images.length > 0 ? `![${item.name}](${item.images[0].url})` : ""}`,
        PreviewProperties: {
          "Followers": `${item.followers.total}`,
          "Popularity": `${item.popularity}`
        }
      },
      Actions: [
        {
          Name: "Play",
          Icon: resumeOrPlayImg,
          Action: async () => {
            await play(item.uri)
          }
        }
      ]
    } as Result
  })
  results = results.concat(artistResults)

  //tracks
  const tracks = await current.tracks.savedTracks()
  const trackResults = tracks.items.map(item => {
    return {
      Title: item.track.name,
      SubTitle: `by ${item.track.artists.map(artist => artist.name).join(", ")}`,
      Icon: {
        ImageType: "relative",
        ImageData: "images/app.png"
      },
      Group: "Tracks",
      GroupScore: 70,
      Preview: getPreviewForTrack(item.track),
      Actions: [
        {
          Name: "Play",
          Icon: resumeOrPlayImg,
          Action: async () => {
            await play(item.track.uri)
          }
        }
      ]
    } as Result
  })
  results = results.concat(trackResults)


  //albums
  const albums = await current.albums.savedAlbums()
  const albumResults = albums.items.map(item => {
    return {
      Title: item.album.name,
      SubTitle: `by ${item.album.artists.map(artist => artist.name).join(", ")}`,
      Icon: {
        ImageType: "relative",
        ImageData: "images/app.png"
      },
      Group: "Albums",
      GroupScore: 60,
      Preview: {
        PreviewType: "markdown",
        PreviewData: `${item.album.images.length > 0 ? `![${item.album.name}](${item.album.images[0].url})` : ""}`,
        PreviewProperties: {}
      },
      Actions: [
        {
          Name: "Play",
          Icon: resumeOrPlayImg,
          Action: async () => {
            await play(item.album.uri)
          }
        }
      ]
    } as Result
  })
  results = results.concat(albumResults)

  return results
}

// format duration in ms to mm:ss
const formatDuration = (ms: number): string => {
  const minutes = Math.floor(ms / 60000)
  const seconds = ((ms % 60000) / 1000).toFixed(0)
  return minutes + ":" + (parseInt(seconds) < 10 ? "0" : "") + seconds
}

const getPreviewForTrack = (track: Track): WoxPreview => {
  return {
    PreviewType: "markdown",
    PreviewData: `${track.album.images.length > 0 ? `![${track.album.name}](${track.album.images[0].url})` : ""}`,
    PreviewProperties: {
      "Album": track.album.name,
      "Duration": formatDuration(track.duration_ms),
      "Release": track.album.release_date
    }
  }
}

const userQueue = async (): Promise<Result[]> => {
  const queue = await getUserQueue()
  return queue.queue.map(item => {
    const track = item as Track
    return {
      Title: track.name,
      SubTitle: `by ${track.artists.map(artist => artist.name).join(", ")}`,
      Icon: {
        ImageType: "relative",
        ImageData: "images/app.png"
      },
      Preview: getPreviewForTrack(track),
      Actions: [
        {
          Name: "Play",
          Icon: resumeOrPlayImg,
          Action: async () => {
            await api.Log(NewContext(), "Info", `playing ${track.uri}`)
            await play(track.uri)
          }
        }
      ]
    }
  })
}

export const plugin: Plugin = {
  init: async (ctx: Context, initParams: PluginInitParams) => {
    api = initParams.API
    await startRefreshTokenScheduler(api)

    await api.OnDeepLink(ctx, async (params: MapString) => {
      if (params.action === "spotify-auth") {
        await api.Log(ctx, "Info", "spotify auth deeplink received")
        const code = params.code || ""
        if (code === "") {
          await api.Log(ctx, "Error", "no code received")
          return
        }

        await updateAccessTokenByCode(code)
        await api.ShowApp(ctx)
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
              Icon: authImg,
              Action: async () => {
                await auth()
              }
            }
          ]
        }
      ]
    }

    if (query.Command === "devices") {
      return listDevices(ctx, query)
    }
    if (query.Command === "next") {
      return skipToNext()
    }
    if (query.Command == "prev") {
      return skipToPrev()
    }
    if (query.Command === "queue") {
      return userQueue()
    }
    if (query.Command === "recent") {
      return showRecent()
    }
    if (query.Command === "search") {
      return showSearch(ctx, query)
    }
    if (query.Command === "me") {
      return me()
    }

    return playing()
  }
}
