/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* Maison — the main IniqDash dashboard: the Maison dashboard rebuilt with ordinary IniqDash pages, containers,
   widgets, popups, a radial menu and Home Assistant bindings (entity ids from Maison's own configuration).
   An ordinary version-3 configuration: fully editable, saved and exported like any other. Generated once;
   from now on it is edited in the editor. */
(window.IniqDashboards = window.IniqDashboards || {}).maison = {
 "version": 3,
 "app": {
  "id": "maison",
  "startPage": "home",
  "navigation": {
   "desktop": "left",
   "tablet": "left",
   "mobile": "bottom"
  }
 },
 "pages": [
  {
   "id": "home",
   "name": "Home",
   "icon": "home",
   "nav": true,
   "items": [
    {
     "id": "h-weather",
     "type": "weather",
     "parent": null,
     "config": {
      "location": "Maison",
      "entity": "weather.home"
     },
     "layout": {
      "desktop": {
       "x": 1,
       "y": 1,
       "w": 4,
       "h": 3
      },
      "tablet": {
       "x": 1,
       "y": 1,
       "w": 4,
       "h": 3
      },
      "mobile": {
       "w": 4,
       "h": 3
      }
     }
    },
    {
     "id": "h-indoor",
     "type": "sensor",
     "parent": null,
     "config": {
      "status": "Salle à manger",
      "tone": "neutral",
      "name": "Indoor temp",
      "entity": "sensor.living_room_temperature",
      "icon": "temperature",
      "precision": 1
     },
     "layout": {
      "desktop": {
       "x": 1,
       "y": 4,
       "w": 2,
       "h": 3
      },
      "tablet": {
       "x": 1,
       "y": 4,
       "w": 2,
       "h": 3
      },
      "mobile": {
       "w": 2,
       "h": 3
      }
     }
    },
    {
     "id": "h-humidity",
     "type": "sensor",
     "parent": null,
     "config": {
      "status": "Chambre",
      "tone": "neutral",
      "name": "Humidity",
      "entity": "sensor.living_room_humidity",
      "icon": "humidity",
      "precision": 0
     },
     "layout": {
      "desktop": {
       "x": 3,
       "y": 4,
       "w": 2,
       "h": 3
      },
      "tablet": {
       "x": 3,
       "y": 4,
       "w": 2,
       "h": 3
      },
      "mobile": {
       "w": 2,
       "h": 3
      }
     }
    },
    {
     "id": "h-who",
     "type": "container",
     "parent": null,
     "config": {
      "title": "Who's home",
      "icon": "home",
      "variant": "secondary"
     },
     "layout": {
      "desktop": {
       "x": 5,
       "y": 1,
       "w": 4,
       "h": 6
      },
      "tablet": {
       "x": 5,
       "y": 1,
       "w": 4,
       "h": 6
      },
      "mobile": {
       "w": 4,
       "h": 6
      }
     }
    },
    {
     "id": "h-p-alex",
     "type": "person",
     "parent": "h-who",
     "config": {
      "name": "Alex",
      "entity": "person.alex"
     },
     "layout": {
      "desktop": {
       "w": 2,
       "h": 2
      },
      "tablet": {
       "w": 2,
       "h": 2
      },
      "mobile": {
       "w": 2,
       "h": 2
      }
     }
    },
    {
     "id": "h-p-robin",
     "type": "person",
     "parent": "h-who",
     "config": {
      "name": "Robin",
      "entity": "person.robin"
     },
     "layout": {
      "desktop": {
       "w": 2,
       "h": 2
      },
      "tablet": {
       "w": 2,
       "h": 2
      },
      "mobile": {
       "w": 2,
       "h": 2
      }
     }
    },
    {
     "id": "h-p-sam",
     "type": "person",
     "parent": "h-who",
     "config": {
      "name": "Sam",
      "entity": "person.sam"
     },
     "layout": {
      "desktop": {
       "w": 2,
       "h": 2
      },
      "tablet": {
       "w": 2,
       "h": 2
      },
      "mobile": {
       "w": 2,
       "h": 2
      }
     }
    },
    {
     "id": "h-p-baby",
     "type": "person",
     "parent": "h-who",
     "config": {
      "name": "Baby",
      "entity": "person.baby"
     },
     "layout": {
      "desktop": {
       "w": 2,
       "h": 2
      },
      "tablet": {
       "w": 2,
       "h": 2
      },
      "mobile": {
       "w": 2,
       "h": 2
      }
     }
    },
    {
     "id": "h-stove",
     "type": "climate",
     "parent": null,
     "config": {
      "name": "Poêle à pellets",
      "entity": "climate.pellet_stove",
      "showCurrent": false
     },
     "layout": {
      "desktop": {
       "x": 9,
       "y": 1,
       "w": 4,
       "h": 7
      },
      "tablet": {
       "x": 1,
       "y": 7,
       "w": 4,
       "h": 7
      },
      "mobile": {
       "w": 4,
       "h": 7
      }
     }
    },
    {
     "id": "h-player",
     "type": "media",
     "parent": null,
     "config": {
      "name": "Echo",
      "subtitle": "Salle à manger",
      "icon": "speaker",
      "entity": "media_player.living_room_speaker"
     },
     "layout": {
      "desktop": {
       "x": 1,
       "y": 7,
       "w": 4,
       "h": 4
      },
      "tablet": {
       "x": 5,
       "y": 7,
       "w": 4,
       "h": 4
      },
      "mobile": {
       "w": 4,
       "h": 4
      }
     }
    },
    {
     "id": "h-devices",
     "type": "container",
     "parent": null,
     "config": {
      "title": "My devices",
      "icon": "power",
      "variant": "secondary"
     },
     "layout": {
      "desktop": {
       "x": 5,
       "y": 7,
       "w": 4,
       "h": 8
      },
      "tablet": {
       "x": 5,
       "y": 11,
       "w": 4,
       "h": 8
      },
      "mobile": {
       "w": 4,
       "h": 8
      }
     }
    },
    {
     "id": "h-coffee",
     "type": "switch",
     "parent": "h-devices",
     "config": {
      "name": "Coffee machine",
      "subtitle": "Kitchen",
      "icon": "plug",
      "entity": "switch.coffee"
     },
     "layout": {
      "desktop": {
       "w": 2,
       "h": 3
      },
      "tablet": {
       "w": 2,
       "h": 3
      },
      "mobile": {
       "w": 2,
       "h": 3
      }
     }
    },
    {
     "id": "h-rice",
     "type": "switch",
     "parent": "h-devices",
     "config": {
      "name": "Rice cooker",
      "subtitle": "Kitchen",
      "icon": "plug",
      "entity": "switch.rice_cooker"
     },
     "layout": {
      "desktop": {
       "w": 2,
       "h": 3
      },
      "tablet": {
       "w": 2,
       "h": 3
      },
      "mobile": {
       "w": 2,
       "h": 3
      }
     }
    },
    {
     "id": "h-washer",
     "type": "switch",
     "parent": "h-devices",
     "config": {
      "name": "Washing machine",
      "subtitle": "Plug",
      "icon": "plug",
      "entity": "switch.holiday_lights_switch"
     },
     "layout": {
      "desktop": {
       "w": 2,
       "h": 3
      },
      "tablet": {
       "w": 2,
       "h": 3
      },
      "mobile": {
       "w": 2,
       "h": 3
      }
     }
    },
    {
     "id": "h-washer-cycle",
     "type": "text",
     "parent": "h-devices",
     "config": {
      "primary": "Wash cycle",
      "entity": "input_boolean.washing_machine_cycle_active",
      "show": "state_name",
      "size": "s",
      "surface": true,
      "align": "left",
      "emphasis": "strong"
     },
     "layout": {
      "desktop": {
       "w": 2,
       "h": 3
      },
      "tablet": {
       "w": 2,
       "h": 3
      },
      "mobile": {
       "w": 2,
       "h": 3
      }
     }
    },
    {
     "id": "h-sun",
     "type": "text",
     "parent": null,
     "config": {
      "primary": "Sun",
      "entity": "sun.sun",
      "show": "state_name",
      "size": "m",
      "surface": true
     },
     "layout": {
      "desktop": {
       "x": 9,
       "y": 8,
       "w": 4,
       "h": 2
      },
      "tablet": {
       "x": 1,
       "y": 14,
       "w": 4,
       "h": 2
      },
      "mobile": {
       "w": 4,
       "h": 2
      }
     }
    },
    {
     "id": "h-washer-power",
     "type": "gauge",
     "parent": null,
     "config": {
      "name": "Washing machine",
      "entity": "sensor.holiday_lights_active_power",
      "unit": "",
      "style": "hbar",
      "min": 0,
      "max": 2500,
      "decimals": 0
     },
     "layout": {
      "desktop": {
       "x": 9,
       "y": 10,
       "w": 4,
       "h": 2
      },
      "tablet": {
       "x": 1,
       "y": 16,
       "w": 4,
       "h": 2
      },
      "mobile": {
       "w": 4,
       "h": 2
      }
     }
    },
    {
     "id": "h-rooms-menu",
     "type": "radial",
     "parent": null,
     "config": {
      "name": "Rooms",
      "count": 6,
      "float": true,
      "actions": [
       {
        "label": "Salle à manger",
        "icon": "sofa",
        "type": "popup",
        "popup": "room-sam",
        "enabled": true,
        "confirm": false,
        "keepOpen": false
       },
       {
        "label": "Cuisine",
        "icon": "pot",
        "type": "popup",
        "popup": "room-cuisine",
        "enabled": true,
        "confirm": false,
        "keepOpen": false
       },
       {
        "label": "Bedrooms",
        "icon": "moon",
        "type": "popup",
        "popup": "room-bedrooms",
        "enabled": true,
        "confirm": false,
        "keepOpen": false
       },
       {
        "label": "Outside",
        "icon": "sun",
        "type": "popup",
        "popup": "room-outside",
        "enabled": true,
        "confirm": false,
        "keepOpen": false
       },
       {
        "label": "Lights",
        "icon": "bulb",
        "type": "navigate",
        "page": "lights",
        "enabled": true,
        "confirm": false,
        "keepOpen": false
       },
       {
        "label": "Alarm",
        "icon": "shield",
        "type": "navigate",
        "page": "security",
        "enabled": true,
        "confirm": false,
        "keepOpen": false
       }
      ]
     },
     "layout": {
      "desktop": {
       "x": 11,
       "y": 12,
       "w": 2,
       "h": 3
      },
      "tablet": {
       "x": 7,
       "y": 14,
       "w": 2,
       "h": 3
      },
      "mobile": {
       "w": 2,
       "h": 3
      }
     },
     "frame": {
      "desktop": {
       "x": 16,
       "y": 560,
       "w": 88,
       "h": 88
      },
      "tablet": {
       "x": 16,
       "y": 975,
       "w": 80,
       "h": 80
      }
     }
    }
   ]
  },
  {
   "id": "lights",
   "name": "Lights",
   "icon": "bulb",
   "nav": true,
   "items": [
    {
     "id": "l-sam",
     "type": "container",
     "parent": null,
     "config": {
      "title": "Salle à manger",
      "subtitle": "Formerly Salon",
      "icon": "sofa",
      "variant": "primary"
     },
     "layout": {
      "desktop": {
       "x": 1,
       "y": 1,
       "w": 6,
       "h": 6
      },
      "tablet": {
       "x": 1,
       "y": 1,
       "w": 8,
       "h": 6
      },
      "mobile": {
       "w": 4,
       "h": 6
      }
     }
    },
    {
     "id": "l-sam-1",
     "type": "light",
     "parent": "l-sam",
     "config": {
      "name": "Plafonnier",
      "entity": "light.salon"
     },
     "layout": {
      "desktop": {
       "w": 3,
       "h": 4
      },
      "tablet": {
       "w": 4,
       "h": 4
      },
      "mobile": {
       "w": 2,
       "h": 4
      }
     }
    },
    {
     "id": "l-sam-2",
     "type": "light",
     "parent": "l-sam",
     "config": {
      "name": "Ambiance LED",
      "entity": "light.ambiance_2"
     },
     "layout": {
      "desktop": {
       "w": 3,
       "h": 4
      },
      "tablet": {
       "w": 4,
       "h": 4
      },
      "mobile": {
       "w": 2,
       "h": 4
      }
     }
    },
    {
     "id": "l-salon",
     "type": "container",
     "parent": null,
     "config": {
      "title": "Salon",
      "subtitle": "Formerly Salle à manger",
      "icon": "sofa",
      "variant": "primary"
     },
     "layout": {
      "desktop": {
       "x": 7,
       "y": 1,
       "w": 6,
       "h": 6
      },
      "tablet": {
       "x": 1,
       "y": 7,
       "w": 8,
       "h": 6
      },
      "mobile": {
       "w": 4,
       "h": 6
      }
     }
    },
    {
     "id": "l-salon-1",
     "type": "light",
     "parent": "l-salon",
     "config": {
      "name": "Plafonnier",
      "entity": "light.light_salle_a_manger"
     },
     "layout": {
      "desktop": {
       "w": 3,
       "h": 4
      },
      "tablet": {
       "w": 4,
       "h": 4
      },
      "mobile": {
       "w": 2,
       "h": 4
      }
     }
    },
    {
     "id": "l-cuisine",
     "type": "container",
     "parent": null,
     "config": {
      "title": "Cuisine",
      "subtitle": "",
      "icon": "pot",
      "variant": "primary"
     },
     "layout": {
      "desktop": {
       "x": 1,
       "y": 7,
       "w": 6,
       "h": 14
      },
      "tablet": {
       "x": 1,
       "y": 13,
       "w": 8,
       "h": 14
      },
      "mobile": {
       "w": 4,
       "h": 14
      }
     }
    },
    {
     "id": "l-cuisine-1",
     "type": "light",
     "parent": "l-cuisine",
     "config": {
      "name": "Cuisine",
      "entity": "light.cuisine"
     },
     "layout": {
      "desktop": {
       "w": 3,
       "h": 4
      },
      "tablet": {
       "w": 4,
       "h": 4
      },
      "mobile": {
       "w": 2,
       "h": 4
      }
     }
    },
    {
     "id": "l-cuisine-2",
     "type": "light",
     "parent": "l-cuisine",
     "config": {
      "name": "Îlot",
      "entity": "light.ilot"
     },
     "layout": {
      "desktop": {
       "w": 3,
       "h": 4
      },
      "tablet": {
       "w": 4,
       "h": 4
      },
      "mobile": {
       "w": 2,
       "h": 4
      }
     }
    },
    {
     "id": "l-cuisine-3",
     "type": "light",
     "parent": "l-cuisine",
     "config": {
      "name": "LED cuisine",
      "entity": "light.kitchen_led"
     },
     "layout": {
      "desktop": {
       "w": 3,
       "h": 4
      },
      "tablet": {
       "w": 4,
       "h": 4
      },
      "mobile": {
       "w": 2,
       "h": 4
      }
     }
    },
    {
     "id": "l-cuisine-4",
     "type": "light",
     "parent": "l-cuisine",
     "config": {
      "name": "Spot îlot A",
      "entity": "light.spot_ilot_a_light"
     },
     "layout": {
      "desktop": {
       "w": 3,
       "h": 4
      },
      "tablet": {
       "w": 4,
       "h": 4
      },
      "mobile": {
       "w": 2,
       "h": 4
      }
     }
    },
    {
     "id": "l-cuisine-5",
     "type": "light",
     "parent": "l-cuisine",
     "config": {
      "name": "Spot îlot B",
      "entity": "light.spot_ilot_b_light_2"
     },
     "layout": {
      "desktop": {
       "w": 3,
       "h": 4
      },
      "tablet": {
       "w": 4,
       "h": 4
      },
      "mobile": {
       "w": 2,
       "h": 4
      }
     }
    },
    {
     "id": "l-cuisine-6",
     "type": "light",
     "parent": "l-cuisine",
     "config": {
      "name": "Spot îlot C",
      "entity": "light.spot_ilot_c_light"
     },
     "layout": {
      "desktop": {
       "w": 3,
       "h": 4
      },
      "tablet": {
       "w": 4,
       "h": 4
      },
      "mobile": {
       "w": 2,
       "h": 4
      }
     }
    },
    {
     "id": "l-bed",
     "type": "container",
     "parent": null,
     "config": {
      "title": "Bedrooms",
      "subtitle": "",
      "icon": "moon",
      "variant": "primary"
     },
     "layout": {
      "desktop": {
       "x": 7,
       "y": 7,
       "w": 6,
       "h": 10
      },
      "tablet": {
       "x": 1,
       "y": 27,
       "w": 8,
       "h": 10
      },
      "mobile": {
       "w": 4,
       "h": 10
      }
     }
    },
    {
     "id": "l-bed-1",
     "type": "light",
     "parent": "l-bed",
     "config": {
      "name": "Chambre",
      "entity": "light.chambre"
     },
     "layout": {
      "desktop": {
       "w": 3,
       "h": 4
      },
      "tablet": {
       "w": 4,
       "h": 4
      },
      "mobile": {
       "w": 2,
       "h": 4
      }
     }
    },
    {
     "id": "l-bed-2",
     "type": "switch",
     "parent": "l-bed",
     "config": {
      "name": "Lampe de chevet",
      "entity": "switch.lampe_de_chevet_switch",
      "subtitle": "Bedrooms",
      "icon": "plug"
     },
     "layout": {
      "desktop": {
       "w": 3,
       "h": 4
      },
      "tablet": {
       "w": 4,
       "h": 4
      },
      "mobile": {
       "w": 2,
       "h": 4
      }
     }
    },
    {
     "id": "l-bed-3",
     "type": "light",
     "parent": "l-bed",
     "config": {
      "name": "Alex",
      "entity": "light.hallway"
     },
     "layout": {
      "desktop": {
       "w": 3,
       "h": 4
      },
      "tablet": {
       "w": 4,
       "h": 4
      },
      "mobile": {
       "w": 2,
       "h": 4
      }
     }
    },
    {
     "id": "l-bath",
     "type": "container",
     "parent": null,
     "config": {
      "title": "Salle de bain",
      "subtitle": "",
      "icon": "drop",
      "variant": "primary"
     },
     "layout": {
      "desktop": {
       "x": 7,
       "y": 17,
       "w": 6,
       "h": 6
      },
      "tablet": {
       "x": 1,
       "y": 37,
       "w": 8,
       "h": 6
      },
      "mobile": {
       "w": 4,
       "h": 6
      }
     }
    },
    {
     "id": "l-bath-1",
     "type": "light",
     "parent": "l-bath",
     "config": {
      "name": "Lumière",
      "entity": "light.salle_de_bain"
     },
     "layout": {
      "desktop": {
       "w": 3,
       "h": 4
      },
      "tablet": {
       "w": 4,
       "h": 4
      },
      "mobile": {
       "w": 2,
       "h": 4
      }
     }
    },
    {
     "id": "l-out",
     "type": "container",
     "parent": null,
     "config": {
      "title": "Outside",
      "subtitle": "Terrace · garden · driveway",
      "icon": "sun",
      "variant": "primary"
     },
     "layout": {
      "desktop": {
       "x": 1,
       "y": 23,
       "w": 12,
       "h": 6
      },
      "tablet": {
       "x": 1,
       "y": 43,
       "w": 8,
       "h": 10
      },
      "mobile": {
       "w": 4,
       "h": 10
      }
     }
    },
    {
     "id": "l-out-1",
     "type": "light",
     "parent": "l-out",
     "config": {
      "name": "Spot terrace",
      "entity": "light.terrace"
     },
     "layout": {
      "desktop": {
       "w": 3,
       "h": 4
      },
      "tablet": {
       "w": 4,
       "h": 4
      },
      "mobile": {
       "w": 2,
       "h": 4
      }
     }
    },
    {
     "id": "l-out-2",
     "type": "light",
     "parent": "l-out",
     "config": {
      "name": "Spot terrace 2",
      "entity": "light.terrace_2"
     },
     "layout": {
      "desktop": {
       "w": 3,
       "h": 4
      },
      "tablet": {
       "w": 4,
       "h": 4
      },
      "mobile": {
       "w": 2,
       "h": 4
      }
     }
    },
    {
     "id": "l-out-3",
     "type": "switch",
     "parent": "l-out",
     "config": {
      "name": "Spot jardin",
      "entity": "switch.garden_spot",
      "subtitle": "Outside",
      "icon": "plug"
     },
     "layout": {
      "desktop": {
       "w": 3,
       "h": 4
      },
      "tablet": {
       "w": 4,
       "h": 4
      },
      "mobile": {
       "w": 2,
       "h": 4
      }
     }
    },
    {
     "id": "l-out-4",
     "type": "light",
     "parent": "l-out",
     "config": {
      "name": "Parking",
      "entity": "light.parking"
     },
     "layout": {
      "desktop": {
       "w": 3,
       "h": 4
      },
      "tablet": {
       "w": 4,
       "h": 4
      },
      "mobile": {
       "w": 2,
       "h": 4
      }
     }
    }
   ]
  },
  {
   "id": "climate",
   "name": "Climate",
   "icon": "thermo",
   "nav": true,
   "items": [
    {
     "id": "c-stove",
     "type": "climate",
     "parent": null,
     "config": {
      "name": "Poêle à pellets",
      "entity": "climate.pellet_stove",
      "showCurrent": false
     },
     "layout": {
      "desktop": {
       "x": 1,
       "y": 1,
       "w": 4,
       "h": 7
      },
      "tablet": {
       "x": 1,
       "y": 1,
       "w": 4,
       "h": 7
      },
      "mobile": {
       "w": 4,
       "h": 7
      }
     }
    },
    {
     "id": "c-stove-info",
     "type": "container",
     "parent": null,
     "config": {
      "title": "Pellet stove",
      "subtitle": "Read-only",
      "icon": "thermo",
      "variant": "secondary"
     },
     "layout": {
      "desktop": {
       "x": 5,
       "y": 1,
       "w": 4,
       "h": 11
      },
      "tablet": {
       "x": 5,
       "y": 1,
       "w": 4,
       "h": 11
      },
      "mobile": {
       "w": 4,
       "h": 11
      }
     }
    },
    {
     "id": "c-stove-state",
     "type": "text",
     "parent": "c-stove-info",
     "config": {
      "primary": "State",
      "entity": "sensor.pellet_stove_current_state",
      "show": "state_name",
      "size": "s",
      "surface": true
     },
     "layout": {
      "desktop": {
       "w": 4,
       "h": 2
      },
      "tablet": {
       "w": 4,
       "h": 2
      },
      "mobile": {
       "w": 4,
       "h": 2
      }
     }
    },
    {
     "id": "c-stove-power",
     "type": "text",
     "parent": "c-stove-info",
     "config": {
      "primary": "Power level",
      "entity": "select.pellet_stove_manual_power",
      "show": "state_name",
      "size": "s",
      "surface": true
     },
     "layout": {
      "desktop": {
       "w": 4,
       "h": 2
      },
      "tablet": {
       "w": 4,
       "h": 2
      },
      "mobile": {
       "w": 4,
       "h": 2
      }
     }
    },
    {
     "id": "c-stove-alarm",
     "type": "text",
     "parent": "c-stove-info",
     "config": {
      "primary": "Stove alarm",
      "entity": "binary_sensor.pellet_stove_alarm",
      "show": "state_name",
      "size": "s",
      "surface": true
     },
     "layout": {
      "desktop": {
       "w": 4,
       "h": 2
      },
      "tablet": {
       "w": 4,
       "h": 2
      },
      "mobile": {
       "w": 4,
       "h": 2
      }
     }
    },
    {
     "id": "c-stove-exhaust",
     "type": "sensor",
     "parent": "c-stove-info",
     "config": {
      "status": "",
      "tone": "neutral",
      "name": "Exhaust",
      "entity": "sensor.pellet_stove_exhaust_temperature",
      "icon": "temperature",
      "precision": 0
     },
     "layout": {
      "desktop": {
       "w": 4,
       "h": 3
      },
      "tablet": {
       "w": 4,
       "h": 3
      },
      "mobile": {
       "w": 4,
       "h": 3
      }
     }
    },
    {
     "id": "c-parents",
     "type": "climate",
     "parent": null,
     "config": {
      "name": "Thermostat bedroom 1",
      "entity": "climate.bedroom_1_thermostat"
     },
     "layout": {
      "desktop": {
       "x": 9,
       "y": 1,
       "w": 4,
       "h": 7
      },
      "tablet": {
       "x": 1,
       "y": 8,
       "w": 4,
       "h": 7
      },
      "mobile": {
       "w": 4,
       "h": 7
      }
     }
    },
    {
     "id": "c-charlie",
     "type": "climate",
     "parent": null,
     "config": {
      "name": "Thermostat bedroom 2",
      "entity": "climate.bedroom_2_thermostat"
     },
     "layout": {
      "desktop": {
       "x": 9,
       "y": 8,
       "w": 4,
       "h": 7
      },
      "tablet": {
       "x": 5,
       "y": 12,
       "w": 4,
       "h": 7
      },
      "mobile": {
       "w": 4,
       "h": 7
      }
     }
    },
    {
     "id": "c-indoor",
     "type": "sensor",
     "parent": null,
     "config": {
      "status": "",
      "tone": "neutral",
      "name": "Indoor temp",
      "entity": "sensor.living_room_temperature",
      "icon": "temperature",
      "precision": 1
     },
     "layout": {
      "desktop": {
       "x": 1,
       "y": 8,
       "w": 2,
       "h": 3
      },
      "tablet": {
       "x": 1,
       "y": 15,
       "w": 2,
       "h": 3
      },
      "mobile": {
       "w": 2,
       "h": 3
      }
     }
    },
    {
     "id": "c-humidity",
     "type": "sensor",
     "parent": null,
     "config": {
      "status": "",
      "tone": "neutral",
      "name": "Humidity",
      "entity": "sensor.living_room_humidity",
      "icon": "humidity",
      "precision": 0
     },
     "layout": {
      "desktop": {
       "x": 3,
       "y": 8,
       "w": 2,
       "h": 3
      },
      "tablet": {
       "x": 3,
       "y": 15,
       "w": 2,
       "h": 3
      },
      "mobile": {
       "w": 2,
       "h": 3
      }
     }
    },
    {
     "id": "c-weather",
     "type": "weather",
     "parent": null,
     "config": {
      "location": "Outside",
      "entity": "weather.home"
     },
     "layout": {
      "desktop": {
       "x": 1,
       "y": 11,
       "w": 4,
       "h": 3
      },
      "tablet": {
       "x": 1,
       "y": 18,
       "w": 4,
       "h": 3
      },
      "mobile": {
       "w": 4,
       "h": 3
      }
     }
    },
    {
     "id": "c-bathfan",
     "type": "switch",
     "parent": null,
     "config": {
      "name": "Extracteur",
      "subtitle": "Salle de bain",
      "icon": "extractor",
      "entity": "input_boolean.bathroom_fan"
     },
     "layout": {
      "desktop": {
       "x": 5,
       "y": 12,
       "w": 2,
       "h": 3
      },
      "tablet": {
       "x": 5,
       "y": 19,
       "w": 2,
       "h": 3
      },
      "mobile": {
       "w": 2,
       "h": 3
      }
     }
    },
    {
     "id": "c-indoor-chart",
     "type": "chart",
     "parent": null,
     "config": {
      "name": "Indoor temperature",
      "entity": "sensor.living_room_temperature",
      "unit": "",
      "kind": "line",
      "range": "24h"
     },
     "layout": {
      "desktop": {
       "x": 1,
       "y": 15,
       "w": 8,
       "h": 5
      },
      "tablet": {
       "x": 1,
       "y": 22,
       "w": 8,
       "h": 5
      },
      "mobile": {
       "w": 4,
       "h": 5
      }
     }
    }
   ]
  },
  {
   "id": "devices",
   "name": "Devices",
   "icon": "sofa",
   "subtitle": "Rooms",
   "nav": true,
   "items": [
    {
     "id": "d-sam",
     "type": "button",
     "parent": null,
     "config": {
      "text": "Salle à manger",
      "secondary": "2 lights · TV · Echo · stove",
      "icon": "sofa",
      "layout": "icon-left",
      "shape": "rect",
      "action": "popup",
      "popup": "room-sam"
     },
     "layout": {
      "desktop": {
       "x": 1,
       "y": 1,
       "w": 4,
       "h": 3
      },
      "tablet": {
       "x": 1,
       "y": 1,
       "w": 4,
       "h": 3
      },
      "mobile": {
       "w": 4,
       "h": 3
      }
     }
    },
    {
     "id": "d-salon",
     "type": "button",
     "parent": null,
     "config": {
      "text": "Salon",
      "secondary": "1 light",
      "icon": "sofa",
      "layout": "icon-left",
      "shape": "rect",
      "action": "popup",
      "popup": "room-salon"
     },
     "layout": {
      "desktop": {
       "x": 5,
       "y": 1,
       "w": 4,
       "h": 3
      },
      "tablet": {
       "x": 5,
       "y": 1,
       "w": 4,
       "h": 3
      },
      "mobile": {
       "w": 4,
       "h": 3
      }
     }
    },
    {
     "id": "d-cuisine",
     "type": "button",
     "parent": null,
     "config": {
      "text": "Cuisine",
      "secondary": "6 lights · appliances",
      "icon": "pot",
      "layout": "icon-left",
      "shape": "rect",
      "action": "popup",
      "popup": "room-cuisine"
     },
     "layout": {
      "desktop": {
       "x": 9,
       "y": 1,
       "w": 4,
       "h": 3
      },
      "tablet": {
       "x": 1,
       "y": 4,
       "w": 4,
       "h": 3
      },
      "mobile": {
       "w": 4,
       "h": 3
      }
     }
    },
    {
     "id": "d-bath",
     "type": "button",
     "parent": null,
     "config": {
      "text": "Salle de bain",
      "secondary": "Light · fan · Echo Dot",
      "icon": "drop",
      "layout": "icon-left",
      "shape": "rect",
      "action": "popup",
      "popup": "room-bath"
     },
     "layout": {
      "desktop": {
       "x": 1,
       "y": 4,
       "w": 4,
       "h": 3
      },
      "tablet": {
       "x": 5,
       "y": 4,
       "w": 4,
       "h": 3
      },
      "mobile": {
       "w": 4,
       "h": 3
      }
     }
    },
    {
     "id": "d-bed",
     "type": "button",
     "parent": null,
     "config": {
      "text": "Bedrooms",
      "secondary": "Lights · thermostats · TV · Echos",
      "icon": "moon",
      "layout": "icon-left",
      "shape": "rect",
      "action": "popup",
      "popup": "room-bedrooms"
     },
     "layout": {
      "desktop": {
       "x": 5,
       "y": 4,
       "w": 4,
       "h": 3
      },
      "tablet": {
       "x": 1,
       "y": 7,
       "w": 4,
       "h": 3
      },
      "mobile": {
       "w": 4,
       "h": 3
      }
     }
    },
    {
     "id": "d-out",
     "type": "button",
     "parent": null,
     "config": {
      "text": "Outside",
      "secondary": "Terrace · garden · driveway",
      "icon": "sun",
      "layout": "icon-left",
      "shape": "rect",
      "action": "popup",
      "popup": "room-outside"
     },
     "layout": {
      "desktop": {
       "x": 9,
       "y": 4,
       "w": 4,
       "h": 3
      },
      "tablet": {
       "x": 5,
       "y": 7,
       "w": 4,
       "h": 3
      },
      "mobile": {
       "w": 4,
       "h": 3
      }
     }
    },
    {
     "id": "d-cave",
     "type": "button",
     "parent": null,
     "config": {
      "text": "Cave",
      "secondary": "Echo Dot",
      "icon": "music",
      "layout": "icon-left",
      "shape": "rect",
      "action": "popup",
      "popup": "room-cave"
     },
     "layout": {
      "desktop": {
       "x": 1,
       "y": 7,
       "w": 4,
       "h": 3
      },
      "tablet": {
       "x": 1,
       "y": 10,
       "w": 4,
       "h": 3
      },
      "mobile": {
       "w": 4,
       "h": 3
      }
     }
    }
   ]
  },
  {
   "id": "meters",
   "name": "Meters",
   "icon": "bolt",
   "nav": true,
   "items": [
    {
     "id": "m-solar",
     "type": "gauge",
     "parent": null,
     "config": {
      "unit": "",
      "name": "Solar",
      "entity": "sensor.solar_power",
      "style": "arc",
      "decimals": 0
     },
     "layout": {
      "desktop": {
       "x": 1,
       "y": 1,
       "w": 3,
       "h": 4
      },
      "tablet": {
       "x": 1,
       "y": 1,
       "w": 4,
       "h": 4
      },
      "mobile": {
       "w": 2,
       "h": 4
      }
     }
    },
    {
     "id": "m-import",
     "type": "gauge",
     "parent": null,
     "config": {
      "unit": "",
      "name": "Grid import",
      "entity": "sensor.electricity_meter_power_consumption",
      "style": "arc"
     },
     "layout": {
      "desktop": {
       "x": 4,
       "y": 1,
       "w": 3,
       "h": 4
      },
      "tablet": {
       "x": 5,
       "y": 1,
       "w": 4,
       "h": 4
      },
      "mobile": {
       "w": 2,
       "h": 4
      }
     }
    },
    {
     "id": "m-export",
     "type": "gauge",
     "parent": null,
     "config": {
      "unit": "",
      "name": "Grid export",
      "entity": "sensor.electricity_meter_power_production",
      "style": "arc"
     },
     "layout": {
      "desktop": {
       "x": 7,
       "y": 1,
       "w": 3,
       "h": 4
      },
      "tablet": {
       "x": 1,
       "y": 5,
       "w": 4,
       "h": 4
      },
      "mobile": {
       "w": 2,
       "h": 4
      }
     }
    },
    {
     "id": "m-solar-total",
     "type": "sensor",
     "parent": null,
     "config": {
      "status": "Total",
      "tone": "neutral",
      "name": "Solar energy",
      "entity": "sensor.solar_energy",
      "icon": "solar",
      "precision": 0
     },
     "layout": {
      "desktop": {
       "x": 10,
       "y": 1,
       "w": 3,
       "h": 4
      },
      "tablet": {
       "x": 5,
       "y": 5,
       "w": 4,
       "h": 4
      },
      "mobile": {
       "w": 2,
       "h": 4
      }
     }
    },
    {
     "id": "m-solar-chart",
     "type": "chart",
     "parent": null,
     "config": {
      "name": "Solar power",
      "entity": "sensor.solar_power",
      "unit": "",
      "kind": "area",
      "range": "24h"
     },
     "layout": {
      "desktop": {
       "x": 1,
       "y": 5,
       "w": 6,
       "h": 5
      },
      "tablet": {
       "x": 1,
       "y": 9,
       "w": 8,
       "h": 5
      },
      "mobile": {
       "w": 4,
       "h": 5
      }
     }
    },
    {
     "id": "m-import-chart",
     "type": "chart",
     "parent": null,
     "config": {
      "name": "Grid import",
      "entity": "sensor.electricity_meter_power_consumption",
      "unit": "",
      "kind": "line",
      "range": "24h"
     },
     "layout": {
      "desktop": {
       "x": 7,
       "y": 5,
       "w": 6,
       "h": 5
      },
      "tablet": {
       "x": 1,
       "y": 14,
       "w": 8,
       "h": 5
      },
      "mobile": {
       "w": 4,
       "h": 5
      }
     }
    },
    {
     "id": "m-elec",
     "type": "container",
     "parent": null,
     "config": {
      "title": "Electricity meter",
      "subtitle": "Tariff 1 / 2",
      "icon": "bolt",
      "variant": "secondary"
     },
     "layout": {
      "desktop": {
       "x": 1,
       "y": 10,
       "w": 4,
       "h": 9
      },
      "tablet": {
       "x": 1,
       "y": 19,
       "w": 8,
       "h": 6
      },
      "mobile": {
       "w": 4,
       "h": 9
      }
     }
    },
    {
     "id": "m-imp1",
     "type": "sensor",
     "parent": "m-elec",
     "config": {
      "status": "",
      "tone": "neutral",
      "name": "Import T1",
      "entity": "sensor.electricity_meter_energy_consumption_tarif_1",
      "icon": "energy",
      "precision": 0
     },
     "layout": {
      "desktop": {
       "w": 2,
       "h": 3
      },
      "tablet": {
       "w": 2,
       "h": 3
      },
      "mobile": {
       "w": 2,
       "h": 3
      }
     }
    },
    {
     "id": "m-imp2",
     "type": "sensor",
     "parent": "m-elec",
     "config": {
      "status": "",
      "tone": "neutral",
      "name": "Import T2",
      "entity": "sensor.electricity_meter_energy_consumption_tarif_2",
      "icon": "energy",
      "precision": 0
     },
     "layout": {
      "desktop": {
       "w": 2,
       "h": 3
      },
      "tablet": {
       "w": 2,
       "h": 3
      },
      "mobile": {
       "w": 2,
       "h": 3
      }
     }
    },
    {
     "id": "m-exp1",
     "type": "sensor",
     "parent": "m-elec",
     "config": {
      "status": "",
      "tone": "neutral",
      "name": "Export T1",
      "entity": "sensor.electricity_meter_energy_production_tarif_1",
      "icon": "solar",
      "precision": 0
     },
     "layout": {
      "desktop": {
       "w": 2,
       "h": 3
      },
      "tablet": {
       "w": 2,
       "h": 3
      },
      "mobile": {
       "w": 2,
       "h": 3
      }
     }
    },
    {
     "id": "m-exp2",
     "type": "sensor",
     "parent": "m-elec",
     "config": {
      "status": "",
      "tone": "neutral",
      "name": "Export T2",
      "entity": "sensor.electricity_meter_energy_production_tarif_2",
      "icon": "solar",
      "precision": 0
     },
     "layout": {
      "desktop": {
       "w": 2,
       "h": 3
      },
      "tablet": {
       "w": 2,
       "h": 3
      },
      "mobile": {
       "w": 2,
       "h": 3
      }
     }
    },
    {
     "id": "m-gas",
     "type": "container",
     "parent": null,
     "config": {
      "title": "Gas",
      "icon": "pot",
      "variant": "secondary"
     },
     "layout": {
      "desktop": {
       "x": 5,
       "y": 10,
       "w": 4,
       "h": 9
      },
      "tablet": {
       "x": 1,
       "y": 25,
       "w": 8,
       "h": 6
      },
      "mobile": {
       "w": 4,
       "h": 9
      }
     }
    },
    {
     "id": "m-gas-today",
     "type": "sensor",
     "parent": "m-gas",
     "config": {
      "status": "",
      "tone": "neutral",
      "name": "Today",
      "entity": "sensor.gas_daily",
      "icon": "gas",
      "precision": 2
     },
     "layout": {
      "desktop": {
       "w": 2,
       "h": 3
      },
      "tablet": {
       "w": 2,
       "h": 3
      },
      "mobile": {
       "w": 2,
       "h": 3
      }
     }
    },
    {
     "id": "m-gas-month",
     "type": "sensor",
     "parent": "m-gas",
     "config": {
      "status": "",
      "tone": "neutral",
      "name": "This month",
      "entity": "sensor.gas_monthly",
      "icon": "gas",
      "precision": 1
     },
     "layout": {
      "desktop": {
       "w": 2,
       "h": 3
      },
      "tablet": {
       "w": 2,
       "h": 3
      },
      "mobile": {
       "w": 2,
       "h": 3
      }
     }
    },
    {
     "id": "m-gas-total",
     "type": "sensor",
     "parent": "m-gas",
     "config": {
      "status": "",
      "tone": "neutral",
      "name": "Meter",
      "entity": "sensor.gas_meter",
      "icon": "gas",
      "precision": 0
     },
     "layout": {
      "desktop": {
       "w": 2,
       "h": 3
      },
      "tablet": {
       "w": 2,
       "h": 3
      },
      "mobile": {
       "w": 2,
       "h": 3
      }
     }
    },
    {
     "id": "m-water",
     "type": "container",
     "parent": null,
     "config": {
      "title": "Water",
      "icon": "drop",
      "variant": "secondary"
     },
     "layout": {
      "desktop": {
       "x": 9,
       "y": 10,
       "w": 4,
       "h": 9
      },
      "tablet": {
       "x": 1,
       "y": 31,
       "w": 8,
       "h": 6
      },
      "mobile": {
       "w": 4,
       "h": 9
      }
     }
    },
    {
     "id": "m-w-flow",
     "type": "sensor",
     "parent": "m-water",
     "config": {
      "status": "",
      "tone": "neutral",
      "name": "Flow now",
      "entity": "sensor.water_flow",
      "icon": "water",
      "precision": 1
     },
     "layout": {
      "desktop": {
       "w": 2,
       "h": 3
      },
      "tablet": {
       "w": 2,
       "h": 3
      },
      "mobile": {
       "w": 2,
       "h": 3
      }
     }
    },
    {
     "id": "m-w-today",
     "type": "sensor",
     "parent": "m-water",
     "config": {
      "status": "",
      "tone": "neutral",
      "name": "Today",
      "entity": "sensor.water_usage_daily",
      "icon": "water",
      "precision": 0
     },
     "layout": {
      "desktop": {
       "w": 2,
       "h": 3
      },
      "tablet": {
       "w": 2,
       "h": 3
      },
      "mobile": {
       "w": 2,
       "h": 3
      }
     }
    },
    {
     "id": "m-w-month",
     "type": "sensor",
     "parent": "m-water",
     "config": {
      "status": "",
      "tone": "neutral",
      "name": "This month",
      "entity": "sensor.water_usage_monthly",
      "icon": "water",
      "precision": 1
     },
     "layout": {
      "desktop": {
       "w": 2,
       "h": 3
      },
      "tablet": {
       "w": 2,
       "h": 3
      },
      "mobile": {
       "w": 2,
       "h": 3
      }
     }
    },
    {
     "id": "m-w-total",
     "type": "sensor",
     "parent": "m-water",
     "config": {
      "status": "",
      "tone": "neutral",
      "name": "Meter",
      "entity": "sensor.water_meter_total",
      "icon": "water",
      "precision": 1
     },
     "layout": {
      "desktop": {
       "w": 2,
       "h": 3
      },
      "tablet": {
       "w": 2,
       "h": 3
      },
      "mobile": {
       "w": 2,
       "h": 3
      }
     }
    }
   ]
  },
  {
   "id": "security",
   "name": "Security",
   "icon": "shield",
   "nav": true,
   "items": [
    {
     "id": "s-alarm",
     "type": "alarm",
     "parent": null,
     "config": {
      "name": "Alarm",
      "entity": "alarm_control_panel.home"
     },
     "layout": {
      "desktop": {
       "x": 1,
       "y": 1,
       "w": 6,
       "h": 5
      },
      "tablet": {
       "x": 1,
       "y": 1,
       "w": 8,
       "h": 5
      },
      "mobile": {
       "w": 4,
       "h": 5
      }
     }
    },
    {
     "id": "s-note",
     "type": "text",
     "parent": null,
     "config": {
      "primary": "Cameras",
      "secondary": "No camera entities in Home Assistant",
      "size": "s",
      "emphasis": "muted",
      "surface": true
     },
     "layout": {
      "desktop": {
       "x": 7,
       "y": 1,
       "w": 6,
       "h": 2
      },
      "tablet": {
       "x": 1,
       "y": 6,
       "w": 8,
       "h": 2
      },
      "mobile": {
       "w": 4,
       "h": 2
      }
     }
    }
   ]
  }
 ],
 "popups": [
  {
   "id": "room-sam",
   "name": "Salle à manger",
   "config": {
    "title": "Salle à manger",
    "icon": "sofa",
    "size": "custom",
    "custom": {
     "desktop": {
      "w": 920,
      "h": 820
     },
     "tablet": {
      "w": 700,
      "h": 900
     }
    },
    "closeButton": true,
    "backdrop": true,
    "outsideClose": true,
    "escClose": true,
    "enter": "scale",
    "exit": "fade",
    "speed": "normal"
   },
   "items": [
    {
     "id": "room-sam-c",
     "type": "container",
     "parent": null,
     "config": {
      "title": "",
      "variant": "bare",
      "icon": ""
     },
     "layout": {
      "mobile": {
       "w": 4,
       "h": 25
      }
     },
     "frame": {
      "desktop": {
       "x": 0,
       "y": 0,
       "w": 880,
       "h": 782
      },
      "tablet": {
       "x": 0,
       "y": 0,
       "w": 660,
       "h": 994
      }
     }
    },
    {
     "id": "room-sam-1",
     "type": "light",
     "parent": "room-sam-c",
     "config": {
      "name": "Plafonnier",
      "entity": "light.salon"
     },
     "layout": {
      "desktop": {
       "w": 3,
       "h": 4
      },
      "tablet": {
       "w": 3,
       "h": 4
      },
      "mobile": {
       "w": 2,
       "h": 4
      }
     }
    },
    {
     "id": "room-sam-2",
     "type": "light",
     "parent": "room-sam-c",
     "config": {
      "name": "Ambiance LED",
      "entity": "light.ambiance_2"
     },
     "layout": {
      "desktop": {
       "w": 3,
       "h": 4
      },
      "tablet": {
       "w": 3,
       "h": 4
      },
      "mobile": {
       "w": 2,
       "h": 4
      }
     }
    },
    {
     "id": "room-sam-3",
     "type": "climate",
     "parent": "room-sam-c",
     "config": {
      "name": "Poêle à pellets",
      "entity": "climate.pellet_stove",
      "showCurrent": false
     },
     "layout": {
      "desktop": {
       "w": 4,
       "h": 7
      },
      "tablet": {
       "w": 4,
       "h": 7
      },
      "mobile": {
       "w": 4,
       "h": 7
      }
     }
    },
    {
     "id": "room-sam-4",
     "type": "media",
     "parent": "room-sam-c",
     "config": {
      "name": "Living room TV",
      "icon": "tv",
      "entity": "media_player.living_room_tv",
      "subtitle": "Salle à manger"
     },
     "layout": {
      "desktop": {
       "w": 4,
       "h": 4
      },
      "tablet": {
       "w": 3,
       "h": 4
      },
      "mobile": {
       "w": 4,
       "h": 4
      }
     }
    },
    {
     "id": "room-sam-5",
     "type": "media",
     "parent": "room-sam-c",
     "config": {
      "name": "Echo",
      "icon": "speaker",
      "entity": "media_player.living_room_speaker",
      "subtitle": "Salle à manger"
     },
     "layout": {
      "desktop": {
       "w": 4,
       "h": 4
      },
      "tablet": {
       "w": 3,
       "h": 4
      },
      "mobile": {
       "w": 4,
       "h": 4
      }
     }
    }
   ]
  },
  {
   "id": "room-salon",
   "name": "Salon",
   "config": {
    "title": "Salon",
    "icon": "sofa",
    "size": "custom",
    "custom": {
     "desktop": {
      "w": 920,
      "h": 289
     },
     "tablet": {
      "w": 700,
      "h": 289
     }
    },
    "closeButton": true,
    "backdrop": true,
    "outsideClose": true,
    "escClose": true,
    "enter": "scale",
    "exit": "fade",
    "speed": "normal"
   },
   "items": [
    {
     "id": "room-salon-c",
     "type": "container",
     "parent": null,
     "config": {
      "title": "",
      "variant": "bare",
      "icon": ""
     },
     "layout": {
      "mobile": {
       "w": 4,
       "h": 10
      }
     },
     "frame": {
      "desktop": {
       "x": 0,
       "y": 0,
       "w": 880,
       "h": 199
      },
      "tablet": {
       "x": 0,
       "y": 0,
       "w": 660,
       "h": 199
      }
     }
    },
    {
     "id": "room-salon-1",
     "type": "light",
     "parent": "room-salon-c",
     "config": {
      "name": "Plafonnier",
      "entity": "light.light_salle_a_manger"
     },
     "layout": {
      "desktop": {
       "w": 3,
       "h": 4
      },
      "tablet": {
       "w": 3,
       "h": 4
      },
      "mobile": {
       "w": 2,
       "h": 4
      }
     }
    }
   ]
  },
  {
   "id": "room-cuisine",
   "name": "Cuisine",
   "config": {
    "title": "Cuisine",
    "icon": "pot",
    "size": "custom",
    "custom": {
     "desktop": {
      "w": 920,
      "h": 820
     },
     "tablet": {
      "w": 700,
      "h": 872
     }
    },
    "closeButton": true,
    "backdrop": true,
    "outsideClose": true,
    "escClose": true,
    "enter": "scale",
    "exit": "fade",
    "speed": "normal"
   },
   "items": [
    {
     "id": "room-cuisine-c",
     "type": "container",
     "parent": null,
     "config": {
      "title": "",
      "variant": "bare",
      "icon": ""
     },
     "layout": {
      "mobile": {
       "w": 4,
       "h": 21
      }
     },
     "frame": {
      "desktop": {
       "x": 0,
       "y": 0,
       "w": 880,
       "h": 782
      },
      "tablet": {
       "x": 0,
       "y": 0,
       "w": 660,
       "h": 782
      }
     }
    },
    {
     "id": "room-cuisine-1",
     "type": "light",
     "parent": "room-cuisine-c",
     "config": {
      "name": "Cuisine",
      "entity": "light.cuisine"
     },
     "layout": {
      "desktop": {
       "w": 3,
       "h": 4
      },
      "tablet": {
       "w": 3,
       "h": 4
      },
      "mobile": {
       "w": 2,
       "h": 4
      }
     }
    },
    {
     "id": "room-cuisine-2",
     "type": "light",
     "parent": "room-cuisine-c",
     "config": {
      "name": "Îlot",
      "entity": "light.ilot"
     },
     "layout": {
      "desktop": {
       "w": 3,
       "h": 4
      },
      "tablet": {
       "w": 3,
       "h": 4
      },
      "mobile": {
       "w": 2,
       "h": 4
      }
     }
    },
    {
     "id": "room-cuisine-3",
     "type": "light",
     "parent": "room-cuisine-c",
     "config": {
      "name": "LED cuisine",
      "entity": "light.kitchen_led"
     },
     "layout": {
      "desktop": {
       "w": 3,
       "h": 4
      },
      "tablet": {
       "w": 3,
       "h": 4
      },
      "mobile": {
       "w": 2,
       "h": 4
      }
     }
    },
    {
     "id": "room-cuisine-4",
     "type": "light",
     "parent": "room-cuisine-c",
     "config": {
      "name": "Spot îlot A",
      "entity": "light.spot_ilot_a_light"
     },
     "layout": {
      "desktop": {
       "w": 3,
       "h": 4
      },
      "tablet": {
       "w": 3,
       "h": 4
      },
      "mobile": {
       "w": 2,
       "h": 4
      }
     }
    },
    {
     "id": "room-cuisine-5",
     "type": "light",
     "parent": "room-cuisine-c",
     "config": {
      "name": "Spot îlot B",
      "entity": "light.spot_ilot_b_light_2"
     },
     "layout": {
      "desktop": {
       "w": 3,
       "h": 4
      },
      "tablet": {
       "w": 3,
       "h": 4
      },
      "mobile": {
       "w": 2,
       "h": 4
      }
     }
    },
    {
     "id": "room-cuisine-6",
     "type": "light",
     "parent": "room-cuisine-c",
     "config": {
      "name": "Spot îlot C",
      "entity": "light.spot_ilot_c_light"
     },
     "layout": {
      "desktop": {
       "w": 3,
       "h": 4
      },
      "tablet": {
       "w": 3,
       "h": 4
      },
      "mobile": {
       "w": 2,
       "h": 4
      }
     }
    },
    {
     "id": "room-cuisine-7",
     "type": "switch",
     "parent": "room-cuisine-c",
     "config": {
      "name": "Coffee machine",
      "icon": "plug",
      "entity": "switch.coffee",
      "subtitle": "Cuisine"
     },
     "layout": {
      "desktop": {
       "w": 2,
       "h": 3
      },
      "tablet": {
       "w": 2,
       "h": 3
      },
      "mobile": {
       "w": 2,
       "h": 3
      }
     }
    },
    {
     "id": "room-cuisine-8",
     "type": "switch",
     "parent": "room-cuisine-c",
     "config": {
      "name": "Rice cooker",
      "icon": "plug",
      "entity": "switch.rice_cooker",
      "subtitle": "Cuisine"
     },
     "layout": {
      "desktop": {
       "w": 2,
       "h": 3
      },
      "tablet": {
       "w": 2,
       "h": 3
      },
      "mobile": {
       "w": 2,
       "h": 3
      }
     }
    }
   ]
  },
  {
   "id": "room-bath",
   "name": "Salle de bain",
   "config": {
    "title": "Salle de bain",
    "icon": "drop",
    "size": "custom",
    "custom": {
     "desktop": {
      "w": 920,
      "h": 501
     },
     "tablet": {
      "w": 700,
      "h": 501
     }
    },
    "closeButton": true,
    "backdrop": true,
    "outsideClose": true,
    "escClose": true,
    "enter": "scale",
    "exit": "fade",
    "speed": "normal"
   },
   "items": [
    {
     "id": "room-bath-c",
     "type": "container",
     "parent": null,
     "config": {
      "title": "",
      "variant": "bare",
      "icon": ""
     },
     "layout": {
      "mobile": {
       "w": 4,
       "h": 14
      }
     },
     "frame": {
      "desktop": {
       "x": 0,
       "y": 0,
       "w": 880,
       "h": 411
      },
      "tablet": {
       "x": 0,
       "y": 0,
       "w": 660,
       "h": 411
      }
     }
    },
    {
     "id": "room-bath-1",
     "type": "light",
     "parent": "room-bath-c",
     "config": {
      "name": "Lumière",
      "entity": "light.salle_de_bain"
     },
     "layout": {
      "desktop": {
       "w": 3,
       "h": 4
      },
      "tablet": {
       "w": 3,
       "h": 4
      },
      "mobile": {
       "w": 2,
       "h": 4
      }
     }
    },
    {
     "id": "room-bath-2",
     "type": "switch",
     "parent": "room-bath-c",
     "config": {
      "name": "Extracteur",
      "icon": "extractor",
      "entity": "input_boolean.bathroom_fan",
      "subtitle": "Salle de bain"
     },
     "layout": {
      "desktop": {
       "w": 3,
       "h": 4
      },
      "tablet": {
       "w": 3,
       "h": 4
      },
      "mobile": {
       "w": 2,
       "h": 4
      }
     }
    },
    {
     "id": "room-bath-3",
     "type": "media",
     "parent": "room-bath-c",
     "config": {
      "name": "Echo Dot",
      "icon": "speaker",
      "entity": "media_player.bathroom_speaker",
      "subtitle": "Salle de bain"
     },
     "layout": {
      "desktop": {
       "w": 4,
       "h": 4
      },
      "tablet": {
       "w": 3,
       "h": 4
      },
      "mobile": {
       "w": 4,
       "h": 4
      }
     }
    }
   ]
  },
  {
   "id": "room-bedrooms",
   "name": "Bedrooms",
   "config": {
    "title": "Bedrooms",
    "icon": "moon",
    "size": "custom",
    "custom": {
     "desktop": {
      "w": 920,
      "h": 820
     },
     "tablet": {
      "w": 700,
      "h": 900
     }
    },
    "closeButton": true,
    "backdrop": true,
    "outsideClose": true,
    "escClose": true,
    "enter": "scale",
    "exit": "fade",
    "speed": "normal"
   },
   "items": [
    {
     "id": "room-bedrooms-c",
     "type": "container",
     "parent": null,
     "config": {
      "title": "",
      "variant": "bare",
      "icon": ""
     },
     "layout": {
      "mobile": {
       "w": 4,
       "h": 41
      }
     },
     "frame": {
      "desktop": {
       "x": 0,
       "y": 0,
       "w": 880,
       "h": 1418
      },
      "tablet": {
       "x": 0,
       "y": 0,
       "w": 660,
       "h": 1842
      }
     }
    },
    {
     "id": "room-bedrooms-1",
     "type": "light",
     "parent": "room-bedrooms-c",
     "config": {
      "name": "Chambre",
      "entity": "light.chambre"
     },
     "layout": {
      "desktop": {
       "w": 3,
       "h": 4
      },
      "tablet": {
       "w": 3,
       "h": 4
      },
      "mobile": {
       "w": 2,
       "h": 4
      }
     }
    },
    {
     "id": "room-bedrooms-2",
     "type": "switch",
     "parent": "room-bedrooms-c",
     "config": {
      "name": "Lampe de chevet",
      "icon": "plug",
      "entity": "switch.lampe_de_chevet_switch",
      "subtitle": "Bedrooms"
     },
     "layout": {
      "desktop": {
       "w": 3,
       "h": 4
      },
      "tablet": {
       "w": 3,
       "h": 4
      },
      "mobile": {
       "w": 2,
       "h": 4
      }
     }
    },
    {
     "id": "room-bedrooms-3",
     "type": "light",
     "parent": "room-bedrooms-c",
     "config": {
      "name": "Alex",
      "entity": "light.hallway"
     },
     "layout": {
      "desktop": {
       "w": 3,
       "h": 4
      },
      "tablet": {
       "w": 3,
       "h": 4
      },
      "mobile": {
       "w": 2,
       "h": 4
      }
     }
    },
    {
     "id": "room-bedrooms-4",
     "type": "climate",
     "parent": "room-bedrooms-c",
     "config": {
      "name": "Thermostat bedroom 1",
      "entity": "climate.bedroom_1_thermostat"
     },
     "layout": {
      "desktop": {
       "w": 4,
       "h": 7
      },
      "tablet": {
       "w": 4,
       "h": 7
      },
      "mobile": {
       "w": 4,
       "h": 7
      }
     }
    },
    {
     "id": "room-bedrooms-5",
     "type": "climate",
     "parent": "room-bedrooms-c",
     "config": {
      "name": "Thermostat bedroom 2",
      "entity": "climate.bedroom_2_thermostat"
     },
     "layout": {
      "desktop": {
       "w": 4,
       "h": 7
      },
      "tablet": {
       "w": 4,
       "h": 7
      },
      "mobile": {
       "w": 4,
       "h": 7
      }
     }
    },
    {
     "id": "room-bedrooms-6",
     "type": "media",
     "parent": "room-bedrooms-c",
     "config": {
      "name": "Echo Chambre",
      "icon": "speaker",
      "entity": "media_player.bedroom_speaker",
      "subtitle": "Bedrooms"
     },
     "layout": {
      "desktop": {
       "w": 4,
       "h": 4
      },
      "tablet": {
       "w": 3,
       "h": 4
      },
      "mobile": {
       "w": 4,
       "h": 4
      }
     }
    },
    {
     "id": "room-bedrooms-7",
     "type": "media",
     "parent": "room-bedrooms-c",
     "config": {
      "name": "Bedroom TV",
      "icon": "tv",
      "entity": "media_player.bedroom_tv",
      "subtitle": "Bedrooms"
     },
     "layout": {
      "desktop": {
       "w": 4,
       "h": 4
      },
      "tablet": {
       "w": 3,
       "h": 4
      },
      "mobile": {
       "w": 4,
       "h": 4
      }
     }
    },
    {
     "id": "room-bedrooms-8",
     "type": "media",
     "parent": "room-bedrooms-c",
     "config": {
      "name": "Bedroom 2 speaker",
      "icon": "speaker",
      "entity": "media_player.bedroom_2_speaker",
      "subtitle": "Bedrooms"
     },
     "layout": {
      "desktop": {
       "w": 4,
       "h": 4
      },
      "tablet": {
       "w": 3,
       "h": 4
      },
      "mobile": {
       "w": 4,
       "h": 4
      }
     }
    },
    {
     "id": "room-bedrooms-9",
     "type": "media",
     "parent": "room-bedrooms-c",
     "config": {
      "name": "Kitchen speaker",
      "icon": "speaker",
      "entity": "media_player.kitchen_speaker",
      "subtitle": "Bedrooms"
     },
     "layout": {
      "desktop": {
       "w": 4,
       "h": 4
      },
      "tablet": {
       "w": 3,
       "h": 4
      },
      "mobile": {
       "w": 4,
       "h": 4
      }
     }
    }
   ]
  },
  {
   "id": "room-outside",
   "name": "Outside",
   "config": {
    "title": "Outside",
    "icon": "sun",
    "size": "custom",
    "custom": {
     "desktop": {
      "w": 920,
      "h": 501
     },
     "tablet": {
      "w": 700,
      "h": 713
     }
    },
    "closeButton": true,
    "backdrop": true,
    "outsideClose": true,
    "escClose": true,
    "enter": "scale",
    "exit": "fade",
    "speed": "normal"
   },
   "items": [
    {
     "id": "room-outside-c",
     "type": "container",
     "parent": null,
     "config": {
      "title": "",
      "variant": "bare",
      "icon": ""
     },
     "layout": {
      "mobile": {
       "w": 4,
       "h": 18
      }
     },
     "frame": {
      "desktop": {
       "x": 0,
       "y": 0,
       "w": 880,
       "h": 411
      },
      "tablet": {
       "x": 0,
       "y": 0,
       "w": 660,
       "h": 623
      }
     }
    },
    {
     "id": "room-outside-1",
     "type": "light",
     "parent": "room-outside-c",
     "config": {
      "name": "Spot terrace",
      "entity": "light.terrace"
     },
     "layout": {
      "desktop": {
       "w": 3,
       "h": 4
      },
      "tablet": {
       "w": 3,
       "h": 4
      },
      "mobile": {
       "w": 2,
       "h": 4
      }
     }
    },
    {
     "id": "room-outside-2",
     "type": "light",
     "parent": "room-outside-c",
     "config": {
      "name": "Spot terrace 2",
      "entity": "light.terrace_2"
     },
     "layout": {
      "desktop": {
       "w": 3,
       "h": 4
      },
      "tablet": {
       "w": 3,
       "h": 4
      },
      "mobile": {
       "w": 2,
       "h": 4
      }
     }
    },
    {
     "id": "room-outside-3",
     "type": "switch",
     "parent": "room-outside-c",
     "config": {
      "name": "Spot jardin",
      "icon": "plug",
      "entity": "switch.garden_spot",
      "subtitle": "Outside"
     },
     "layout": {
      "desktop": {
       "w": 3,
       "h": 4
      },
      "tablet": {
       "w": 3,
       "h": 4
      },
      "mobile": {
       "w": 2,
       "h": 4
      }
     }
    },
    {
     "id": "room-outside-4",
     "type": "light",
     "parent": "room-outside-c",
     "config": {
      "name": "Parking",
      "entity": "light.parking"
     },
     "layout": {
      "desktop": {
       "w": 3,
       "h": 4
      },
      "tablet": {
       "w": 3,
       "h": 4
      },
      "mobile": {
       "w": 2,
       "h": 4
      }
     }
    },
    {
     "id": "room-outside-5",
     "type": "weather",
     "parent": "room-outside-c",
     "config": {
      "location": "Outside",
      "entity": "weather.home"
     },
     "layout": {
      "desktop": {
       "w": 4,
       "h": 3
      },
      "tablet": {
       "w": 4,
       "h": 3
      },
      "mobile": {
       "w": 4,
       "h": 3
      }
     }
    }
   ]
  },
  {
   "id": "room-cave",
   "name": "Cave",
   "config": {
    "title": "Cave",
    "icon": "music",
    "size": "custom",
    "custom": {
     "desktop": {
      "w": 920,
      "h": 289
     },
     "tablet": {
      "w": 700,
      "h": 289
     }
    },
    "closeButton": true,
    "backdrop": true,
    "outsideClose": true,
    "escClose": true,
    "enter": "scale",
    "exit": "fade",
    "speed": "normal"
   },
   "items": [
    {
     "id": "room-cave-c",
     "type": "container",
     "parent": null,
     "config": {
      "title": "",
      "variant": "bare",
      "icon": ""
     },
     "layout": {
      "mobile": {
       "w": 4,
       "h": 10
      }
     },
     "frame": {
      "desktop": {
       "x": 0,
       "y": 0,
       "w": 880,
       "h": 199
      },
      "tablet": {
       "x": 0,
       "y": 0,
       "w": 660,
       "h": 199
      }
     }
    },
    {
     "id": "room-cave-1",
     "type": "media",
     "parent": "room-cave-c",
     "config": {
      "name": "Echo Dot Cave",
      "icon": "speaker",
      "entity": "media_player.basement_speaker",
      "subtitle": "Cave"
     },
     "layout": {
      "desktop": {
       "w": 4,
       "h": 4
      },
      "tablet": {
       "w": 3,
       "h": 4
      },
      "mobile": {
       "w": 4,
       "h": 4
      }
     }
    }
   ]
  }
 ],
 "notifications": {
  "templates": [],
  "rules": []
 }
};
