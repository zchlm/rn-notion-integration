// TODO assume this runs every day

const { Client } = require("@notionhq/client");
const moment = require("moment");

// Initializing a client
const notion = new Client({
  auth:
    process.env.NOTION_TOKEN ||
    "secret_Iq0Cevx1Mtwxn9ofGhVRTIIt0g4ie6Zhxn1MSMGL7JA",
});

const firstDayOfCycle = moment("2021-08-02");
const today = moment();
const daysLeft = today.diff(firstDayOfCycle, "days") % 14;
const fortnightStartDate = today.subtract(daysLeft, "days");
const fortnightEndDate = moment(fortnightStartDate).add(14, "days");

const invoicePeriodFilter =
  fortnightStartDate.format("MMM D - ") + fortnightEndDate.format("MMM D");

(async () => {
  try {
    const members = await getMemberIds();
    members.forEach((id) => {
      handle(id);
    });
  } catch (error) {
    // todo: try again in x minutes
    console.error(error);
  }
})();

async function getMemberIds() {
  const invoices = await notion.databases.query({
    database_id: "d56a7b0466aa496ca84b1db1f4b1844b", // Invoices database
    filter: {
      property: "Invoice Period",
      formula: {
        text: {
          equals: invoicePeriodFilter,
        },
      },
    },
  });

  let members = [];
  for (const task of invoices.results) {
    members = members.concat(task.properties["Created By"].created_by);
  }
  members = members.map((m) => m.id);
  // Dedupe
  return members.filter((item, pos) => members.indexOf(item) === pos);
}

function timeout(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function handle(user_id) {
  // Query tasks database
  const tasks = await notion.databases.query({
    database_id: "ed4361f28cab4cb38686d835a640ae42", // Tasks database
    filter: {
      and: [
        {
          property: "State",
          select: {
            equals: "Invoiced",
          },
        },
        {
          property: "Invoice Period",
          formula: {
            text: {
              equals: invoicePeriodFilter,
            },
          },
        },
        {
          property: "Members",
          people: {
            contains: user_id,
          },
        },
      ],
    },
  });

  // Query invoices in this pay-cycle
  const invoices = await notion.databases.query({
    database_id: "d56a7b0466aa496ca84b1db1f4b1844b", // Invoices database
    filter: {
      and: [
        {
          property: "Invoice Period",
          formula: {
            text: {
              equals: invoicePeriodFilter,
            },
          },
        },
        {
          property: "Created By",
          people: {
            contains: user_id,
          },
        },
      ],
    },
  });

  // Loop through each invoice
  for (const invoice of invoices.results) {
    // console.log("Task update", invoice);
    // Now relate invoice to all tasks for this cycle
    const updateResponse = await notion.pages.update({
      page_id: invoice.id,
      properties: {
        "Related to Tasks": {
          relation: tasks.results.map((t) => {
            return {
              id: t.id,
            };
          }),
        },
      },
    });

    // Get child blocks on invoice page
    const response = await notion.blocks.children.list({
      block_id: invoice.id,
      page_size: 20,
    });

    const blocks = response.results;

    // Delete un-needed database and heading
    // Relies on Invoice template to have:
    // Database - to delete
    // Heading 3 - separator / for reference
    const headingIndex = blocks.findIndex((b) => b.type === "heading_3");
    const headingId =
      (blocks[headingIndex] && blocks[headingIndex].id) || false;
    const databaseIndex =
      (blocks[headingIndex - 1] && blocks[headingIndex - 1].id) || false;

    // Skip in loop if neither blocks are found
    if (headingIndex < 0 || databaseIndex < 0) return;

    const headingResponse = await notion.blocks.delete({
      block_id: headingId,
    });
    console.log(headingResponse);

    const databaseResponse = await notion.blocks.delete({
      block_id: databaseIndex,
    });
    console.log(databaseResponse);
  }
}
