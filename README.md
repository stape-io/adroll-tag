# AdRoll tag for Google Tag Manager Server Side

Send site or app events directly to AdRoll from your GTM server container. This template handles event tracking, user identification, and parameter mapping for AdRoll's server-side API.

## How to use AdRoll tag

1. Add AdRoll tag to the server GTM from the template gallery.
2. Add Advertisable ID (You can find it [here](https://app.adroll.com/segments) under _AdRoll > Website > View Pixel > `adroll_adv_id`_).
3. Add Pixel ID (You can find it [here](https://app.adroll.com/segments) under _AdRoll > Website > View Pixel > `adroll_pix_id`_).
4. Add API Access Token (contacting your AdRoll account manager may be necessary).
5. Create events and add user, item and custom attributes.

### There are three ways of sending events:

- **Standard** - select one of the standard names.
- **Inherit from the client** - tag will parse sGTM event names and match them to AdRoll standard events.
- **Custom** - set the event name dynamically using a variable. It must be one of the [supported event names](#supported-event-names).

### Supported Event Names

- `pageView`
- `productSearch`
- `addToCart`
- `purchase`

### Required Fields

- **Advertisable ID** – Your AdRoll Advertisable ID.
- **Pixel ID** – Your AdRoll Pixel ID.
- **Access Token** – AdRoll Access Token (contact your account manager).
- **Event Name** – Choose or define an event name from the options above.
- **Page Location** – Web: URL of the current page; App: fake URL in the format specified on the template field.
- **IP Address** – The user's IP address.
- **At Least One User Identifier** – Select from identifiers such as email, device ID, browser ID etc.

## Useful links:

[Step-by-step guide on how to configure AdRoll tag](https://stape.io/blog/adroll-server-side-tracking)

## Open Source

The **AdRoll Tag for GTM Server Side** is developed and maintained by the [Stape Team](https://stape.io/) under the Apache 2.0 license.
