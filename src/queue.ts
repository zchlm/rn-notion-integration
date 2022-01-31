import * as cron from "cron"
import { main } from "./index"

const job = new cron.CronJob(
  "*/2 * * * *",
  async function () {
    console.log("You will see this message every 2 minutes")
    await main()
  },
  null,
  true,
  "UTC"
)
