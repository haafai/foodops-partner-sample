# FoodOps delivery partner sample: guides

These pages show you how to use this repository to build and test an integration with a restaurant that runs
FoodOps. Each page is one task, written so that you can follow it without reading the others first.

## What this repository is for

It is a working example of a delivery partner integration, with everything you need to try it on your own machine:

- a TypeScript client for the partner API that you can copy (`packages/client`);
- a webhook receiver whose handler you can copy (`packages/webhook-receiver`);
- a mock of the API, so you can develop without a restaurant (`packages/mock-server`);
- a small ordering app that shows the patterns on screen (`apps/demo`);
- twenty-five named checks you can run against the mock or a test restaurant (`apps/scenarios`).

## What it is not

- It is not a production service. The demo keeps the key in the browser, and the receiver keeps its secret and its
  events in memory and serves one key.
- It is not the API. The mock follows [`CONTRACT.md`](../../CONTRACT.md) and differs from the real API in the
  places listed in [Use the mock server](09-Use-the-mock-server.md).
- It is not the reference for wire details. Endpoint paths, field names, status codes and error codes are in
  [`CONTRACT.md`](../../CONTRACT.md); the reasoning behind them is in the
  [integration guide](../integration-guide.md). These pages link there instead of repeating the tables.

## Who it is for

An engineer at a delivery platform who is connecting to one or more restaurants. You need Node 22 and a terminal.
The commands are written for a POSIX shell (bash, zsh, or Git Bash on Windows) and use `curl`.
The expected output shown under a command is real output from the mock, trimmed to the lines that matter. Ids and
times will differ on your machine.

## The pages

| Page | What it gets you |
|---|---|
| [1. Run the demo locally](01-Run-the-demo-locally.md) | The mock and the ordering app running, and a first order placed. |
| [2. Get and store your key](02-Get-and-store-your-key.md) | Your key in `.env`, and a clear idea of what it may do. |
| [3. Sync a menu](03-Sync-a-menu.md) | Outlets and a menu fetched, and a cheap re-check with `If-None-Match`. |
| [4. Place and track an order](04-Place-and-track-an-order.md) | An order created safely, followed to a final status, and cancelled. |
| [5. Set up webhooks](05-Set-up-webhooks.md) | Signed events arriving at the receiver, verified and de-duplicated. |
| [6. Expose your receiver](06-Expose-your-receiver.md) | A public https address for the receiver, with the control port kept private. |
| [7. Point at a real restaurant](07-Point-at-a-real-restaurant.md) | The same tools aimed at a test restaurant instead of the mock. |
| [8. Run the scenarios](08-Run-the-scenarios.md) | A pass, skip or fail for each of the twenty-five checks. |
| [9. Use the mock server](09-Use-the-mock-server.md) | The built-in keys, the restaurant simulator, and where the mock differs. |
| [10. Go-live checklist](10-Go-live-checklist.md) | A list to tick before you use a live key. |
| [Troubleshooting](Troubleshooting.md) | The cause and the fix for a message or behaviour you are seeing. |
| [FAQ](FAQ.md) | Short answers that link into the pages above. |

## Start here

**You are evaluating the API.** Read [Run the demo locally](01-Run-the-demo-locally.md), place an order, and press
the simulator buttons. Then skim [`CONTRACT.md`](../../CONTRACT.md) and the [FAQ](FAQ.md).

**You are building an integration.** Follow the numbered pages in order: [1](01-Run-the-demo-locally.md),
[2](02-Get-and-store-your-key.md), [3](03-Sync-a-menu.md), [4](04-Place-and-track-an-order.md), then
[8](08-Run-the-scenarios.md) against the mock. Add webhooks with [5](05-Set-up-webhooks.md) and
[6](06-Expose-your-receiver.md), move to a test restaurant with [7](07-Point-at-a-real-restaurant.md), and finish
with the [go-live checklist](10-Go-live-checklist.md).

**You already have an integration and are adding webhooks.** Read [Set up webhooks](05-Set-up-webhooks.md) and
[Expose your receiver](06-Expose-your-receiver.md), then the webhook rows of the
[go-live checklist](10-Go-live-checklist.md). Keep your polling: a webhook does not replace it.
