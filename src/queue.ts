import * as cron from "cron"
import { main } from "./index"

const job = new cron.CronJob(
  "*/1 * * * *",
  async function () {
    await main()
  },
  null,
  true,
  "UTC"
)
