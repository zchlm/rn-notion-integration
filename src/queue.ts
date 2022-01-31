import * as cron from "cron"
import { main } from "./index"

const job = new cron.CronJob(
  "*/1 * * * *",
  async function () {
    console.log("You will see this message every 1 minutes")
    await main()
  },
  null,
  true,
  "UTC"
)

// Use this if the 4th param is default value(false)
// job.start()
