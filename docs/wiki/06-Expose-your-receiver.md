# Expose your receiver

At the end of this page your receiver's delivery route has a public https address that a real restaurant's API
will accept, and its control port is still reachable only from your machine.

> The local steps were checked against the mock in this repository. The tunnel step was not run for this page: it
> needs a tunnel service of your choosing. The real API follows [`CONTRACT.md`](../../CONTRACT.md#webhooks).

## Before you start

- The receiver working against the mock: [Set up webhooks](05-Set-up-webhooks.md).
- A way to give a local port a public https address: a tunnel tool for testing on your own machine, or a reverse
  proxy on a server you run.

## Why a public https URL

The mock accepts `http://127.0.0.1:4020/webhooks/foodops` so that everything can run on one machine. A real
restaurant's API does not. It calls your URL from its own servers, so the URL must be reachable from the internet,
and it refuses any address that could point back into a private network.

## The URL rules

The API checks these when you register and again each time it sends an event:

- an absolute URL with the scheme `https`;
- no user name or password in it;
- port 443, or no port;
- at most 2000 characters;
- a host whose every address is public: not loopback, not a private range, not link-local.

A URL that breaks a rule is refused with `400 invalid_webhook_url`. If the host later starts resolving to a private
address, each delivery is recorded with the outcome `blocked_address`. The exact wording is in
[`CONTRACT.md`, Webhooks](../../CONTRACT.md#webhooks).

## Steps

1. Start the receiver, from the repository root.

   ```bash
   npm run receiver
   ```

   It prints the one port that may be exposed:

   ```text
   Webhook receiver listening on http://127.0.0.1:4020/webhooks/foodops
     This is the only port to put a tunnel or a proxy in front of: 4020
   ```

2. Start your tunnel and point it at `http://127.0.0.1:4020`. **Port 4020 only.** The tunnel gives you a public
   https host name; this page calls it `https://your-tunnel-host`.

3. Build the webhook URL: the tunnel's https address followed by `/webhooks/foodops`.

   ```text
   https://your-tunnel-host/webhooks/foodops
   ```

4. Confirm the route is reachable from outside and still refuses an unsigned request. From any machine:

   ```bash
   curl -s -X POST https://your-tunnel-host/webhooks/foodops -H "Content-Type: application/json" -d '{}'
   ```

   Expect the receiver's refusal, which proves the request reached it:

   ```text
   {"error":"invalid_signature"}
   ```

   The same command against `http://127.0.0.1:4020/webhooks/foodops` gives the same answer without a tunnel.

5. Confirm that nothing else is exposed. A path other than the delivery route answers `404` on that port:

   ```bash
   curl -s https://your-tunnel-host/_receiver/state
   ```

   ```text
   {"error":"not_found"}
   ```

6. Register `https://your-tunnel-host/webhooks/foodops` as your webhook URL, with the demo card or by API, exactly
   as in [Set up webhooks](05-Set-up-webhooks.md), step 2. In the demo card, put it in "Webhook URL the restaurant
   will call" and leave the control address at `http://127.0.0.1:4021`.

## Never tunnel the control port

Port 4021 has no login. It sets the signing secret and shows every event the receiver accepted. Its only defence
is that it refuses a request that was not addressed to a loopback name:

```bash
curl -s http://127.0.0.1:4021/_receiver/state -H "Host: example.com"
```

```text
{"error":"host_not_allowed"}
```

Many tunnels rewrite the `Host` header to `localhost` before they forward a request. Behind such a tunnel that
check passes for everyone, and anyone on the internet could replace your secret with their own and then send you
forged events that verify. So:

- Put a tunnel or a proxy in front of port 4020 and nothing else.
- Leave the receiver bound to `127.0.0.1`, which is what `npm run receiver` does.
- In production, apply the same rule to your own service: expose the one delivery route, and keep any
  administration route off the public listener.

## A tunnel address is temporary

Many tunnel tools issue a new host name each time they start. When yours changes, register the new URL. That
`PUT` also issues a new secret, so hand it to the receiver again. Events sent to the old address in between are
lost, not queued.

## Check it worked

- Step 4 answered `{"error":"invalid_signature"}` through the public address.
- After step 6, cause a status change at the restaurant and read `GET webhook`: `lastDelivery.outcome` is
  `delivered`. If it is `http_error`, `timeout` or `connection_failed`, see
  [Troubleshooting](Troubleshooting.md#consecutivefailures-keeps-climbing).

## Next

- [Point at a real restaurant](07-Point-at-a-real-restaurant.md)
- [Run the scenarios](08-Run-the-scenarios.md), which can test webhooks through your tunnel.
