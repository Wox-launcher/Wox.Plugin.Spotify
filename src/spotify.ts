import * as crypto from "crypto"
import open from "open"
import axios from "axios"
import { NewContext, PublicAPI } from "@wox-launcher/wox-plugin"
import { AccessToken, SpotifyApi } from "@spotify/web-api-ts-sdk"
import moment from "moment"


const clientId: string = "8a7e672e219e43fa8d0d73edbfc3d5ab"
let accessToken = {} as AccessToken
let codeVerifier = ""
let woxAPI: PublicAPI
let spotifyAPI: SpotifyApi
let refreshTokenInterval: NodeJS.Timeout

async function auth() {
  const redirectUri = "wox://plugin/aeb94d3d-9c39-4917-9cd0-a4cde95433a2?action=spotify-auth"
  const scope =
    "user-modify-playback-state " +
    "user-read-playback-state " +
    "user-read-currently-playing " +
    "user-read-playback-position " +
    "user-read-recently-played " +
    "user-top-read " +
    "user-read-email " +
    "user-read-private " +
    "user-library-read " +
    "user-library-modify " +
    "playlist-read-private " +
    "playlist-read-collaborative " +
    "playlist-modify-public " +
    "playlist-modify-private " +
    "user-follow-read " +
    "user-follow-modify"

  const authUrl = new URL("https://accounts.spotify.com/authorize")

  const generateRandomString = (length: number) => {
    const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
    const values = crypto.getRandomValues(new Uint8Array(length))
    return values.reduce((acc, x) => acc + possible[x % possible.length], "")
  }

  const sha256 = async (plain: string) => {
    const encoder = new TextEncoder()
    const data = encoder.encode(plain)
    return crypto.subtle.digest("SHA-256", data)
  }

  const base64encode = (input: ArrayBuffer) => {
    return btoa(String.fromCharCode(...new Uint8Array(input)))
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
  }

  codeVerifier = generateRandomString(64)
  const params = {
    response_type: "code",
    client_id: clientId,
    scope,
    code_challenge_method: "S256",
    code_challenge: base64encode(await sha256(codeVerifier)),
    redirect_uri: redirectUri
  }

  authUrl.search = new URLSearchParams(params).toString()

  await open(authUrl.toString())
}

async function refresh() {
  const ctx = NewContext()
  await woxAPI.Log(ctx, "Info", "refreshing access token")
  if (!accessToken.access_token) {
    await woxAPI.Log(ctx, "Info", "no access token found")
    return
  }
  if (accessToken.expires === undefined) {
    await woxAPI.Log(ctx, "Info", "access token has no expiry")
    return
  }
  if (accessToken.expires - Date.now() > 1000 * 60 * 5) {
    await woxAPI.Log(ctx, "Info", "access token is still valid, expires at " + moment().format("YYYY-MM-DD HH:mm:ss"))
    return
  }

  const url = "https://accounts.spotify.com/api/token"
  try {
    const resp = await axios.post<AccessToken>(url, {
      grant_type: "refresh_token",
      refresh_token: accessToken.refresh_token,
      client_id: clientId
    }, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      }
    })

    resp.data.expires = Date.now() + resp.data.expires_in * 1000
    await woxAPI.Log(ctx, "Info", `access token refreshed: ${JSON.stringify(resp.data)}`)
    accessToken = resp.data
    await woxAPI.SaveSetting(ctx, "access_token", JSON.stringify(resp.data), false)
    spotifyAPI = SpotifyApi.withAccessToken(clientId, accessToken)
  } catch (error) {
    // if error is axios error, print response data
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    if (error.response) {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      await woxAPI.Log(ctx, "Error", `error refreshing access token: ${JSON.stringify(error.response.data)}`)
    } else {
      await woxAPI.Log(ctx, "Error", `error refreshing access token: ${error}`)
    }
  }
}

async function startRefreshTokenScheduler(api: PublicAPI) {
  woxAPI = api

  if (refreshTokenInterval) {
    clearInterval(refreshTokenInterval)
  }
  refreshTokenInterval = setInterval(refresh, 1000 * 60)
}

async function updateAccessTokenByCode(code: string) {
  const ctx = NewContext()
  await woxAPI.Log(ctx, "Info", "updating access token, code = " + code)

  const url = "https://accounts.spotify.com/api/token"
  try {
    const resp = await axios.post<AccessToken>(url, {
      grant_type: "authorization_code",
      code,
      redirect_uri: "wox://plugin/aeb94d3d-9c39-4917-9cd0-a4cde95433a2?action=spotify-auth",
      client_id: clientId,
      code_verifier: codeVerifier
    }, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      }
    })

    resp.data.expires = Date.now() + resp.data.expires_in * 1000
    await woxAPI.Log(ctx, "Info", `access token received: ${JSON.stringify(resp.data)}`)
    accessToken = resp.data
    spotifyAPI = SpotifyApi.withAccessToken(clientId, accessToken)
    await woxAPI.SaveSetting(ctx, "access_token", JSON.stringify(resp.data), false)
  } catch (error) {
    // if error is axios error, print response data
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    if (error.response) {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      await woxAPI.Log(ctx, "Error", `error updating access token: ${JSON.stringify(error.response.data)}`)
    } else {
      await woxAPI.Log(ctx, "Error", `error updating access token: ${error}`)
    }
  }
}

async function updateAccessToken(token: AccessToken) {
  accessToken = token
  spotifyAPI = SpotifyApi.withAccessToken(clientId, accessToken)
}

async function getDevices() {
  return spotifyAPI.player.getAvailableDevices()
}

async function activateDevice(deviceId: string) {
  return spotifyAPI.player.transferPlayback([deviceId])
}

async function getCurrentlyPlaying() {
  return spotifyAPI.player.getCurrentlyPlayingTrack()
}

async function next() {
  const devices = await getDevices()
  const deviceId = devices.devices[0].id
  if (!deviceId) {
    await woxAPI.Log(NewContext(), "Error", "no device found")
    return
  }

  return spotifyAPI.player.skipToNext(deviceId)
}

async function getRecentlyPlayed() {
  return spotifyAPI.player.getRecentlyPlayedTracks(10, { type: "before", timestamp: Date.now() })
}

async function previous() {
  const devices = await getDevices()
  const deviceId = devices.devices[0].id
  if (!deviceId) {
    await woxAPI.Log(NewContext(), "Error", "no device found")
    return
  }

  return spotifyAPI.player.skipToPrevious(deviceId)
}

async function pause() {
  const devices = await getDevices()
  const deviceId = devices.devices[0].id
  if (!deviceId) {
    await woxAPI.Log(NewContext(), "Error", "no device found")
    return
  }

  return spotifyAPI.player.pausePlayback(deviceId)
}

async function resume() {
  const devices = await getDevices()
  const deviceId = devices.devices[0].id
  if (!deviceId) {
    await woxAPI.Log(NewContext(), "Error", "no device found")
    return
  }

  return spotifyAPI.player.startResumePlayback(deviceId)
}

async function play(uri: string) {
  if (uri.includes("spotify:track:")) {
    await addTrackToQueue(uri)
    // wait 500ms for the track to be added to the queue
    setTimeout(() => {
      next()
    }, 500)
  }
  if (uri.includes("spotify:artist:")) {
    const devices = await getDevices()
    const deviceId = devices.devices[0].id
    if (!deviceId) {
      await woxAPI.Log(NewContext(), "Error", "no device found")
      return
    }
    await spotifyAPI.player.startResumePlayback(deviceId, uri)
  }
  if (uri.includes("spotify:playlist:")) {
    const devices = await getDevices()
    const deviceId = devices.devices[0].id
    if (!deviceId) {
      await woxAPI.Log(NewContext(), "Error", "no device found")
      return
    }
    await spotifyAPI.player.startResumePlayback(deviceId, uri)
  }
  if (uri.includes("spotify:album:")) {
    const devices = await getDevices()
    const deviceId = devices.devices[0].id
    if (!deviceId) {
      await woxAPI.Log(NewContext(), "Error", "no device found")
      return
    }
    await spotifyAPI.player.startResumePlayback(deviceId, uri)
  }
}

async function getUserQueue() {
  return spotifyAPI.player.getUsersQueue()
}

async function search(query: string) {
  return spotifyAPI.search(query, ["album", "artist", "playlist", "track"])
}

async function addTrackToQueue(trackUri: string) {
  return spotifyAPI.player.addItemToPlaybackQueue(trackUri)
}

async function getCurrentUserInfo() {
  return spotifyAPI.currentUser
}

function isTokenValid() {
  return accessToken.access_token !== "" && accessToken.expires !== undefined && accessToken.expires - Date.now() > 1000 * 60 * 5
}

function stopRefreshTokenScheduler() {
  clearInterval(refreshTokenInterval)
}

export {
  auth,
  updateAccessTokenByCode,
  isTokenValid,
  getDevices,
  updateAccessToken,
  getCurrentlyPlaying,
  next,
  previous,
  pause,
  resume,
  activateDevice,
  getUserQueue,
  play,
  startRefreshTokenScheduler,
  getRecentlyPlayed,
  search,
  getCurrentUserInfo,
  stopRefreshTokenScheduler
}
