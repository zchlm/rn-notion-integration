import { fetchRationalTasksLinked, getBlockChildren } from "./utils"
import { Client as NotionClient } from "@notionhq/client"
import moment from "moment"

// Construct our notion API client instance
const notion = new NotionClient()

function mapTasks(tasks) {
  return tasks.map((task) => {
    if (!task.properties["Last Synced"].date) {
      return task
    }

    const d1 = moment(task.properties["Last Synced"].date.start).utc()
    const d2 = moment(task.properties["Last Edit"].last_edited_time).utc()
    const nowDiff = d2.diff(moment(), "minutes")

    if (d2.isSame(d1) && nowDiff < 0 && nowDiff >= -2) {
      task.sync_again = true
    }
    return task
  })
}

// Tasks that need syncing!
function filterTasks(tasks) {
  return tasks.filter((task) => {
    if (!task.properties["Last Synced"].date) {
      return true
    }

    const d1 = moment(task.properties["Last Synced"].date.start).utc()
    const d2 = moment(task.properties["Last Edit"].last_edited_time).utc()

    if (task.sync_again) {
      return true
    }

    if (d2.diff(d1, "minutes") == -1 || d2.isSame(d1)) {
      return false
    }

    return true
  })
}

async function retrieveClientTasks(notion: NotionClient) {
  const { results: tasks } = await notion.databases.query({
    auth: process.env.CLIENT_SECRET,
    database_id: process.env.CLIENT_DATABASE_ID,

    filter: {
      and: [
        {
          property: "Assigned To",
          people: { contains: process.env.CLIENT_BOT_USER_ID },
        },
      ],
    },
  })

  return tasks ? tasks : null
}

/*
 * clientTasks: Tasks that have changed since last sync
 * RNTasks: Tasks that we sync to
 * */
async function syncTasksWithRN(clientTasks, RNTasks) {
  for (const cTask of clientTasks) {
    // Need to match with RN Tasks
    const RNTask = RNTasks.find((task) => {
      return (
        task.properties["Client Task ID"].rich_text[0].plain_text ===
        cTask.properties["ID"].formula.string
      )
    })

    const blocksRN = await getBlockChildren(
      notion,
      process.env.RATIONAL_SECRET,
      RNTask.id,
      false,
      true
    )

    const briefRNBlock = blocksRN.find((b) => {
      return b.type === "toggle" && b.toggle.text[0].plain_text.match(/Brief/)
    })

    // Delete brief toggle children
    if (briefRNBlock.toggle && briefRNBlock.toggle.children) {
      for (const block of briefRNBlock.toggle.children) {
        await notion.blocks.delete({
          auth: process.env.RATIONAL_SECRET,
          block_id: block.id,
        })
      }
    }

    // Get brief block from client
    const blocksClient = await getBlockChildren(
      notion,
      process.env.CLIENT_SECRET,
      cTask.id,
      true,
      true
    )

    const briefClientBlock = blocksClient.find((b) => {
      return b.type === "toggle" && b.toggle.text[0].plain_text.match(/Brief/)
    })

    await notion.blocks.update({
      auth: process.env.RATIONAL_SECRET,
      block_id: briefRNBlock.id,
      toggle: {
        text: [
          {
            type: "text",
            text: {
              content:
                "Brief (From Client) - Updated: " +
                moment().utc().startOf("minute").toISOString(),
            },
          },
        ],
      },
    })

    // Append brief update to block
    await notion.blocks.children.append({
      auth: process.env.RATIONAL_SECRET,
      block_id: briefRNBlock.id,
      children: briefClientBlock.toggle.children,
    })

    console.log("Sync with RN", cTask, RNTask)

    // We also need to update client task last synced!
    await notion.pages.update({
      page_id: cTask.id,
      auth: process.env.CLIENT_SECRET,
      properties: {
        "Last Synced": {
          date: {
            start: moment().utc().add(1, "minute").toISOString(),
          },
        },
      },
    })

    // Update rational task!
    await notion.pages.update({
      page_id: RNTask.id,
      auth: process.env.RATIONAL_SECRET,
      properties: {
        "Last Synced": {
          date: {
            start: moment().utc().add(1, "minute").toISOString(),
          },
        },
      },
    })
  }
}

async function syncTasksWithClient(RNTasks, clientTasks) {
  // Todo: Can't send roll up field. Update progress field when they use 'Rollup' type. Create formula which references this roll up

  for (const RNTask of RNTasks) {
    // Need to match with RN Tasks
    const clientTask = clientTasks.find((cTask) => {
      return (
        RNTask.properties["Client Task ID"].rich_text[0].plain_text ===
        cTask.properties["ID"].formula.string
      )
    })

    const blocksRN = await getBlockChildren(
      notion,
      process.env.RATIONAL_SECRET,
      RNTask.id,
      true,
      true
    )

    const deliverableRNBlock = blocksRN.find((b) => {
      return (
        b.type === "toggle" && b.toggle.text[0].plain_text.match(/Deliverable/)
      )
    })

    if (deliverableRNBlock) {
      // Send deliverable back to client
      const blocksClient = await getBlockChildren(
        notion,
        process.env.CLIENT_SECRET,
        clientTask.id,
        true,
        true
      )

      const deliverableClientBlock = blocksClient.find((b) => {
        return (
          b.type === "toggle" &&
          b.toggle.text[0].plain_text.match(/Deliverable/)
        )
      })

      // Delete brief toggle children
      if (deliverableClientBlock && deliverableClientBlock.toggle) {
        if (deliverableClientBlock.toggle.children) {
          for (const block of deliverableClientBlock.toggle.children) {
            await notion.blocks.delete({
              auth: process.env.CLIENT_SECRET,
              block_id: block.id,
            })
          }
        }

        await notion.blocks.update({
          auth: process.env.CLIENT_SECRET,
          block_id: deliverableClientBlock.id,
          toggle: {
            text: [
              {
                type: "text",
                text: {
                  content:
                    "Deliverables (From Rational Nomads) - Updated: " +
                    moment().utc().startOf("minute").toISOString(),
                },
              },
            ],
          },
        })

        console.log("Sync with client", clientTask, RNTask)

        // Append deliverables to block
        await notion.blocks.children.append({
          auth: process.env.CLIENT_SECRET,
          block_id: deliverableClientBlock.id,
          children: deliverableRNBlock.toggle.children,
        })
      } else {
        // Create toggle block
        await notion.blocks.children.append({
          auth: process.env.CLIENT_SECRET,
          block_id: clientTask.id,
          children: [
            {
              toggle: {
                text: [
                  {
                    type: "text",
                    text: {
                      content:
                        "Deliverables (From Rational Nomads) - Updated: " +
                        moment().utc().startOf("minute").toISOString(),
                    },
                  },
                ],
                children: deliverableRNBlock.toggle.children,
              },
            },
          ],
        })
      }
    }

    // Update properties last
    const propertiesToUpdate = ["Due Date", "Progress"]

    // Update Client time as we are changing it
    const propertySchemas = {
      "Last Synced": {
        date: {
          start: moment().utc().add(1, "minute").toISOString(),
        },
      },
    }

    propertiesToUpdate.forEach((prop) => {
      propertySchemas[prop] = {
        ...RNTask.properties[prop],
      }
    })

    await notion.pages.update({
      page_id: clientTask.id,
      auth: process.env.CLIENT_SECRET,
      properties: propertySchemas,
    })

    // Also update RN sync time! As user has edited it!
    await notion.pages.update({
      page_id: RNTask.id,
      auth: process.env.RATIONAL_SECRET,
      properties: {
        "Last Synced": {
          date: {
            start: moment().utc().add(1, "minute").toISOString(),
          },
        },
      },
    })
  }
}

async function createTaskRN(notion: NotionClient, task) {
  /*
   * 1. Create page
   * 2. Create database 'requirements' (from template)
   * 3. Append brief (from client) and template blocks
   **/
  const page = await notion.pages.create({
    auth: process.env.RATIONAL_SECRET,
    parent: { database_id: process.env.RATIONAL_DATABASE_ID },
    properties: {
      "Client Task ID": {
        rich_text: [
          {
            text: {
              content: task.properties["ID"].formula.string,
            },
          },
        ],
      },
      Name: {
        title: [
          {
            text: {
              content: task.properties["Name"].title[0].plain_text,
            },
          },
        ],
      },
      "Last Synced": {
        date: {
          start: moment().toISOString(),
        },
      },
    },
  })

  // Template requirements database
  await notion.databases.create({
    auth: process.env.RATIONAL_SECRET,
    parent: { page_id: page.id },
    title: [
      {
        type: "text",
        text: {
          content: "Requirements",
        },
      },
    ],
    properties: {
      Name: {
        title: {},
      },
      Done: {
        checkbox: {},
      },
    },
  })

  const templatePage = await notion.pages.retrieve({
    auth: process.env.RATIONAL_SECRET,
    page_id: process.env.RATIONAL_TASK_TEMPLATE_PAGE_ID,
  })

  const templateChildren = await getBlockChildren(
    notion,
    process.env.RATIONAL_SECRET,
    templatePage.id,
    true,
    true,
    true
  )

  const blocks = await getBlockChildren(
    notion,
    process.env.CLIENT_SECRET,
    task.id,
    true,
    true
  )

  const children = blocks.concat(templateChildren)

  // Append to page
  const res = await notion.blocks.children.append({
    auth: process.env.RATIONAL_SECRET,
    block_id: page.id,
    children: children,
  })

  // todo: set status to 'proposal'?
}

export async function main() {
  const clientTasks = await retrieveClientTasks(notion)

  const rationalTasks = await fetchRationalTasksLinked(notion, clientTasks)

  const tasksToCreateInRN = clientTasks.filter((task) => {
    return !rationalTasks.find(
      (t) =>
        // @ts-ignore
        t.properties["Client Task ID"].rich_text[0].plain_text ===
        // @ts-ignore
        task.properties["ID"].formula.string
    )
  })

  if (tasksToCreateInRN.length) {
    for (const task of tasksToCreateInRN) {
      await createTaskRN(notion, task)
    }
  }

  const cTasks = mapTasks(clientTasks)
  const rTasks = mapTasks(rationalTasks)

  // Client tasks that have been updated
  const clientTasksFiltered = filterTasks(cTasks)

  // RN tasks that have been updated
  const RNTasksFiltered = filterTasks(rTasks)

  // Client task has changed. Sync client to RN
  await syncTasksWithRN(clientTasksFiltered, rTasks)

  // RN task has changed. Sync RN to client.
  await syncTasksWithClient(RNTasksFiltered, cTasks)

  console.log("Finished")
}

for (let i = 0; i < process.argv.length; i++) {
  switch (process.argv[i]) {
    case "start":
      main()
      break
  }
}
