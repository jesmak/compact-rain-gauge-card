# Compact rain gauge card

Home Assistant dashboard card that shows the day's rain as a filling drop, at any size a dashboard gives it.

[![GitHub Release][releases-shield]][releases]
[![License][license-shield]](LICENSE)
[![GitHub Activity][commits-shield]][commits]

## Support

Hey dude! Help me out for a couple of :beers: or a :coffee:!

[![coffee](https://www.buymeacoffee.com/assets/img/custom_images/black_img.png)](https://www.buymeacoffee.com/jesmak)

## What is it?

A small card for a rain sensor: a drop that fills up as the rain adds up, the total beside it, and, when you have a
sensor for it, how hard it is raining now. Tapping it opens the sensor's details.

- **The drop** has marks at round values, and while it rains its surface moves and drops fall into it.
- **How hard it rains** shows as bars beside the rate: one for light rain, two for moderate, three for heavy.
- **Recent days**, if you want them: yesterday's rain, and that of the past week and the past month (the last 7 and
  30 days).
- **Two small charts**, if you want them: the rain day by day as bars, and the rain rate over the last hours as a
  line. Pointing at either, or touching it, shows the value there.

It fits whatever space it is given. In a sections view it works at every width from a quarter of the section to all
of it, and at one row or more; in a masonry view or a horizontal stack it is as tall as its contents need.

|                    | Widest                                                    | Narrowest                                                      |
| ------------------ | --------------------------------------------------------- | -------------------------------------------------------------- |
| **Everything on**  | ![Everything on, widest](docs/images/everything-wide.png) | ![Everything on, narrowest](docs/images/everything-narrow.png) |
| **Everything off** | ![Everything off, widest](docs/images/plain-wide.png)     | ![Everything off, narrowest](docs/images/plain-narrow.png)     |

## Options

The card has a visual editor: add it from the card picker, and it offers a precipitation sensor to start with. The
options can also be written by hand.

| Name                 | Type    | Description                                                                  | Default                   |
| -------------------- | ------- | ---------------------------------------------------------------------------- | ------------------------- |
| `type`               | string  | **Required.** `custom:compact-rain-gauge-card`                               |                           |
| `entity`             | string  | **Required.** The rain so far, such as today's total. The drop fills with it |                           |
| `hourly_rate_entity` | string  | How hard it is raining now, shown under the total                            | none                      |
| `language`           | string  | The card's own language, such as `fi`                                        | Home Assistant's language |
| `max_level`          | number  | The rain that fills the drop, in the sensor's unit                           | 40 mm, or 1.57 in         |
| `animate_rain`       | boolean | Move the surface and let drops fall while the rate sensor says it rains      | `true`                    |
| `show_scale`         | boolean | Marks on the drop at round values                                            | `true`                    |
| `show_intensity`     | boolean | Bars beside the rate for light, moderate or heavy rain                       | `true`                    |
| `show_yesterday`     | boolean | Yesterday's rain                                                             | `false`                   |
| `show_week`          | boolean | The rain of the last 7 days                                                  | `false`                   |
| `show_month`         | boolean | The rain of the last 30 days                                                 | `false`                   |
| `show_daily_chart`   | boolean | The rain day by day, as bars                                                 | `false`                   |
| `daily_chart_days`   | number  | How many days the bars show, from 2 to 60                                    | 14                        |
| `show_rate_chart`    | boolean | The rain rate over the last hours, as a line. Needs `hourly_rate_entity`     | `false`                   |
| `rate_chart_hours`   | number  | How many hours the line shows, from 1 to 168                                 | 24                        |
| `fill_drop_colour`   | string  | Any CSS colour for the rain in the drop and the charts                       | `#04acff`                 |
| `border_colour`      | string  | Any CSS colour for the drop's outline                                        | the theme's text colour   |
| `tap_action`         | object  | What a tap does, as for Home Assistant's own cards                           | `action: more-info`       |
| `hold_action`        | object  | What holding it does                                                         | none                      |
| `double_tap_action`  | object  | What a double tap does                                                       | none                      |
| `is_imperial`        | boolean | Reads a sensor **without a unit** as inches. A sensor with one says          | `false`                   |

```yaml
type: custom:compact-rain-gauge-card
entity: sensor.rain_today
hourly_rate_entity: sensor.rain_rate
show_week: true
show_daily_chart: true
daily_chart_days: 14
```

The figures are written the way Home Assistant writes the sensors' states: in your locale, rounded to the sensor's
precision, with its unit. A rate sensor that counts the rain of the current hour in millimetres is shown as mm/h; one
that already has a rate unit keeps it. While a sensor is unavailable its figure is a dash and the drop stays empty.

How hard it rains follows the usual limits: light below 2.5 mm/h, moderate below 7.6 mm/h, heavy above that. Rain in
inches, or per minute or day, is converted first.

## Where the history comes from

Recent days and the daily bars come from Home Assistant's long-term
statistics, which it keeps for good. They need the sensors to have a `state_class`, as precipitation sensors
usually do; without one those parts stay empty.

- For a sensor that measures (`state_class: measurement`), a day's rain is the sensor's value at the end of the day.
  That is the day's total for a sensor that resets at midnight, the last 24 hours for a rolling sum, and the day's
  report for a sensor that reports once a day. Today's is the sensor's own state.
- For a counter that only grows (`total` or `total_increasing`), a day's rain is how much it grew that day.
- The rate chart comes from the rate sensor's recorded states, which Home Assistant keeps for ten days by default,
  so it reaches back a week at most.

The card asks for the history when it is shown and every 15 minutes after that, and only for what its options need.

## Sizes

The card measures the space it gets and lays itself out to fit:

| Space                                       | Layout                                                       |
| ------------------------------------------- | ------------------------------------------------------------ |
| Wide enough for the figures beside the drop | The drop, and the total and rate with their labels beside it |
| Plenty of width                             | The same, with larger figures                                |
| Narrow, such as a quarter of a section      | The drop above the figures, without labels                   |
| Low, such as one row of a section           | A small drop, the figures beside it without labels           |

The recent days and the charts go under the drop, across the card, each on a tile of its own. In a sections view the card starts at half the
width and two rows, with a row more for the recent days and for each chart, and can be resized down to a quarter of the width and one row.
When it is too low for everything, the rate chart is left out first, then the daily bars, then the recent days, rather than
squeezing the drop's figures out of their labels. The
drop always keeps its shape: it grows with the card's height and shrinks with it.

## Translating

The card's texts are in `src/localize/languages/`, one JSON file per language, named by its language code: `en.json`,
`fi.json`. To add a language, copy `en.json` to the new language's code, such as `sv.json`, and translate the values.
Nothing else needs changing: the card finds the file by itself, offers it in the editor, and uses it when Home
Assistant is set to that language. A text left out falls back to English. Texts ending in `_short` are what the narrowest
cards show in place of the longer ones, so keep them brief.

## How to install

### With HACS

1. Add this repository to HACS custom repositories with type **Dashboard**
2. Search for Compact rain gauge card in HACS and download it
3. Refresh your browser

### Manually

1. Download `compact-rain-gauge-card.js` from the latest release and copy it to the `config/www` folder of your Home
   Assistant installation
2. In Home Assistant settings, open dashboards, click the three dots at the top right and open resources
3. Add a new resource with the path `/local/compact-rain-gauge-card.js` and type JavaScript
4. Refresh your browser

## Upgrading from 1.x

The card keeps its configuration, so nothing has to change. A few things look or work differently:

- Without `border_colour` the drop's outline follows the theme's text colour instead of being black, so it shows on a
  dark theme too. `border_colour: "#000000"` brings the black outline back.
- The unit comes from the sensor, so `is_imperial` only matters for a sensor without a unit.
- The scale marks, the intensity bars and the rain animation are on by default; each has an option to turn it off.
- `name` is no longer read: the label is always "Total" in the card's language.
- The card speaks English and Finnish. With another language chosen it falls back to English; see
  [Translating](#translating) to add one.

## Development

Requires Node 22.13 or newer.

```
npm install
npm run check
```

`npm run check` typechecks, lints, checks formatting, runs the tests and builds `dist/compact-rain-gauge-card.js`,
which is the file HACS installs and is committed to the repository.

| Path                             | What it contains                                                     |
| -------------------------------- | -------------------------------------------------------------------- |
| `src/compact-rain-gauge-card.ts` | The card itself, its layouts, and asking for the history             |
| `src/drop.ts`                    | Drawing the drop: its level, scale and rain                          |
| `src/chart.ts`                   | The small charts and their bubbles                                   |
| `src/history.ts`                 | Reading the recorder: the rain of past days, the last rain, the rate |
| `src/gauge.ts`                   | Reading the sensors: values, units, the fill and the figures         |
| `src/intensity.ts`               | How hard it rains                                                    |
| `src/actions.ts`                 | Telling a tap from a hold or a double tap                            |
| `src/editor.ts`                  | The visual editor                                                    |
| `src/localize/languages/`        | The card's texts, one JSON file per language                         |
| `tests/`                         | Tests, run with vitest                                               |

## Thanks

To [@t1gr0u](https://github.com/t1gr0u) for [rain-gauge-card](https://github.com/t1gr0u/rain-gauge-card), which
this card started out from. It has since been rewritten from scratch.

[commits-shield]: https://img.shields.io/github/commit-activity/y/jesmak/compact-rain-gauge-card.svg?style=for-the-badge
[commits]: https://github.com/jesmak/compact-rain-gauge-card/commits/main
[license-shield]: https://img.shields.io/github/license/jesmak/compact-rain-gauge-card.svg?style=for-the-badge
[releases-shield]: https://img.shields.io/github/release/jesmak/compact-rain-gauge-card.svg?style=for-the-badge
[releases]: https://github.com/jesmak/compact-rain-gauge-card/releases
