import * as crypto from "crypto"
import open from "open"
import axios from "axios"
import { NewContext, PublicAPI } from "@wox-launcher/wox-plugin"
import { AccessToken, SpotifyApi } from "@spotify/web-api-ts-sdk"


const clientId: string = "8a7e672e219e43fa8d0d73edbfc3d5ab"
let accessToken = {} as AccessToken
let codeVerifier = ""
let woxAPI: PublicAPI
let spotifyAPI: SpotifyApi

async function auth() {
  const redirectUri = "wox://plugin/aeb94d3d-9c39-4917-9cd0-a4cde95433a2?action=spotify-auth"
  const scope = "user-modify-playback-state user-read-playback-state user-read-currently-playing user-read-playback-position user-read-recently-played user-top-read"
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

    await woxAPI.Log(ctx, "Info", `access token received: ${JSON.stringify(resp.data)}`)

    accessToken = resp.data
    spotifyAPI = SpotifyApi.withAccessToken(clientId, accessToken)
    return accessToken
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
    return {} as AccessToken
  }
}

async function updateAccessToken(token: AccessToken) {
  accessToken = token
  spotifyAPI = SpotifyApi.withAccessToken(clientId, accessToken)
}

async function getDevices() {
  return spotifyAPI.player.getAvailableDevices()
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

async function previous() {
  const devices = await getDevices()
  const deviceId = devices.devices[0].id
  if (!deviceId) {
    await woxAPI.Log(NewContext(), "Error", "no device found")
    return
  }

  return spotifyAPI.player.skipToPrevious(deviceId)
}

function isTokenValid() {
  return accessToken.access_token !== ""
}

function updateAPI(apiInstance: PublicAPI) {
  woxAPI = apiInstance
}

export {
  auth,
  updateAccessTokenByCode,
  isTokenValid,
  getDevices,
  updateAccessToken,
  updateAPI,
  getCurrentlyPlaying,
  next,
  previous
}
