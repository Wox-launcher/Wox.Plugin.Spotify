import { auth } from "../spotify"

test("query", async () => {
  const devices = await auth()
  console.log(devices)
})
