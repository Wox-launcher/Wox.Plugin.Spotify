import { Context, PublicAPI, Query } from "@wox-launcher/wox-plugin"
import { plugin } from "../index"

test("query", async () => {
  const ctx = {} as Context
  const query = {
    Env: { "ActiveWindowTitle": "" },
    RawQuery: "wpm install ",
    Selection: { Type: "text", Text: "", FilePaths: [] },
    Type: "input",
    Search: "",
    TriggerKeyword: "wpm",
    Command: "install",
    IsGlobalQuery(): boolean {
      return false
    }
  } as Query

  await plugin.init(ctx, {
    PluginDirectory: "", API: {
      Log: (ctx, level, message) => {
        console.log(level, message)
      }
    } as PublicAPI
  })
  const results = await plugin.query(ctx, query)
  expect(results.length).toBeGreaterThan(0)
})
