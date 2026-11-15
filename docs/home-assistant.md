# Connecting Home Assistant

INIQDASH talks to Home Assistant **from your web server**, never from the browser. The browser only asks the INIQDASH server for
states and sends it simple actions ("turn this light on"); the server checks them and calls Home Assistant with your token.

## Create an access token

1. In Home Assistant, open your **profile** (your name, bottom left).
2. Open the **Security** tab and scroll to **Long-lived access tokens**.
3. **Create token**, give it a name such as "INIQDASH", and copy it. Home Assistant shows it only once.

The token has the rights of the Home Assistant user who created it. Consider a separate Home Assistant user for INIQDASH, so you can
remove its access at any time without touching your own account. (INIQDASH works best when it can read Home Assistant's device and
entity registries; if that user is not allowed to, INIQDASH still works and decides from entity names and types instead.)

## Connect

- **During installation:** step 2 of the wizard.
- **Later:** **Edit → More → Home Assistant connection…**

Enter the address and the token, click **Test connection**, then **Save**. The address must be reachable **from the web server**:

| INIQDASH runs… | Use as address |
|---|---|
| at a hosting company | a public HTTPS address of your Home Assistant — e.g. your Home Assistant Cloud remote URL, or your own reverse proxy |
| on your home network | the local address, e.g. `http://192.168.1.50:8123` or `http://homeassistant.local:8123` |

The token is stored on the server only and is never shown again, not even in the settings (it says "a token is saved"). To replace it,
paste a new one and save. If you change the address, you must enter the token again — the saved token is only ever sent to the saved
address.

## What INIQDASH reads and does

- **Reads:** the states and attributes of your entities, your areas, and (when allowed) the entity and device registries — to know which
  entities belong to which device and which ones are technical. History, statistics, calendars, forecasts and camera images are read
  when a widget shows them.
- **Does:** only the actions a widget offers for an entity's own capabilities (switching, dimming, setting a temperature, arming…), from
  a fixed list on the server. It never changes your Home Assistant configuration.

## When something goes wrong

The connection test says what failed: the address cannot be reached, the host name is unknown, the HTTPS certificate is not accepted,
or Home Assistant rejected the token. See [troubleshooting.md](troubleshooting.md#home-assistant). When Home Assistant is temporarily
unreachable, widgets show it and recover by themselves when it is back.
