import * as crypto from "crypto"
import open from "open"

let token = ""

async function auth() {
  const clientId: string = "8a7e672e219e43fa8d0d73edbfc3d5ab"
  const redirectUri = "wox://plugin/aeb94d3d-9c39-4917-9cd0-a4cde95433a2?action=spotify-auth"
  const scope = "user-read-private user-read-email"
  const authUrl = new URL("https://accounts.spotify.com/authorize")
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
  const randomValues = crypto.getRandomValues(new Uint8Array(64))
  const randomString = randomValues.reduce((acc, x) => acc + possible[x % possible.length], "")
  const data = new TextEncoder().encode(randomString)
  const hashed = await crypto.subtle.digest("SHA-256", data)

  const code_challenge_base64 = btoa(String.fromCharCode(...new Uint8Array(hashed)))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")

  const params = {
    response_type: "code",
    client_id: clientId,
    scope,
    code_challenge_method: "S256",
    code_challenge: code_challenge_base64,
    redirect_uri: redirectUri
  }

  authUrl.search = new URLSearchParams(params).toString()

  await open(authUrl.toString())
}

function updateToken(t: string) {
  token = t
}

function isTokenValid() {
  return token !== ""
}

export { auth, updateToken, isTokenValid }
