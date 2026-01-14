export const COMMON_EXPANSION_RULES = {
  the: '(the|my|our)',
  name: '[<the>] {name}',
  area: '[<the>] {area}',
  floor: '[<the>] {floor} [floor]',
  area_floor: '(<area>|<floor>)',
  in_area_floor: '[<in>] <area_floor>',
  what_is: "(what's|whats|what is|tell me)",
  how_is: "(how is|how's|hows)",
  lockable: '[<the>] (lock|door|window|gate|garage door|shutter)[s]',
  where_is: "(where's|wheres|where is)",
  which: '(which|what) [of <the>]',
  is: '(is|are) [(there|<the>)]',
  are: '<is>',
  any: '(any|some) [of <the>]',
  are_any: '[<are>] <any>',
  how_many: 'how many [of <the>]',
  brightness: '{brightness}[([ ]%)| percent]',
  light: '(light|lights|lighting|lamp|lamps)',
  turn: '(turn|switch|change|bring)',
  temp: '(temp|temperature)',
  temperature: '{temperature}[([ ]\u00b0)|( degree[s])]',
  open: '(open|raise|lift) [up]',
  close: '(close|shut|lower) [(up|down)]',
  set: '(set|make|change|turn)',
  numeric_value_set: '(set|change|turn [(up|down)]|increase|decrease|make)',
  in: '(in|on|at|of|across|around|throughout)',
  position: '{position}[([ ]%)| percent]',
  volume: '{volume:volume_level}[([ ]%)| percent]',
  currently: '(currently|presently|right now|at the moment)',
  state: '[(present|current)] (state|status)',
  clean: '(vacuum|clean)',
  all: '(all [[of] <the>]|every [single]|each [and every])',
  are_all: '[<are>] <all>',
  home: '(home|house|apartment|flat)',
  everywhere:
    '(everywhere|all over|[<in>] <the> [(entire|whole)] <home>|[<in>] <all> (room|area|floor)[s])',
  here: '([in] here|[in] (this|<the>) (room|area|space))',
  what_is_the_class_of_name:
    "(<what_is> the <class> (of|in|from|(indicated|measured) by) <name> [in <area>]|<what_is> <name>['s] <class> [in <area>]|<what_is> <area> <name>['s] <class>)",
  timer_set: '(start|set|create)',
  timer_cancel: '(cancel|stop)',
  timer_duration_seconds: '{timer_seconds:seconds}( |-)second[s]',
  timer_duration_minutes:
    '({timer_minutes:minutes}( |-)minute[s] [[and] {timer_seconds:seconds}( |-)second[s]])|({timer_minutes:minutes} and [a] {timer_half:seconds} minute[s])|({timer_half:seconds} a minute[s])',
  timer_duration_hours:
    '({timer_hours:hours}( |-)hour[s] [[and] {timer_minutes:minutes}( |-)minute[s]] [[and] {timer_seconds:seconds}( |-)second[s]])|({timer_hours:hours} and [a] {timer_half:minutes} hour[s])|({timer_half:minutes} an hour[s])',
  timer_duration:
    '<timer_duration_seconds>|<timer_duration_minutes>|<timer_duration_hours>',
  timer_start_seconds: '{timer_seconds:start_seconds}( |-)second[s]',
  timer_start_minutes:
    '{timer_minutes:start_minutes}( |-)minute[s] [[and] {timer_seconds:start_seconds}( |-)second[s]]',
  timer_start_hours:
    '{timer_hours:start_hours}( |-)hour[s] [[and] {timer_minutes:start_minutes}( |-)minute[s]] [[and] {timer_seconds:start_seconds}( |-)second[s]]',
  timer_start:
    '<timer_start_seconds>|<timer_start_minutes>|<timer_start_hours>',
  fan_speed: '{fan_speed:percentage}[%| percent]',
};

export const COMMON_LISTS = {
  color: {
    values: [
      'white',
      'black',
      'red',
      'orange',
      'yellow',
      'green',
      'blue',
      'purple',
      'brown',
      'pink',
      'turquoise',
    ],
  },
  brightness: {
    range: {
      type: 'percentage',
      from: 0,
      to: 100,
    },
  },
  temperature: {
    range: {
      type: 'temperature',
      from: 0,
      to: 100,
      fractions: 'halves',
    },
  },
  brightness_level: {
    values: [
      {
        in: '(max|maximum|highest)',
        out: 100,
      },
      {
        in: '(min|minimum|lowest)',
        out: 1,
      },
    ],
  },
  on_off_states: {
    values: [
      {
        in: 'on',
        out: 'on',
      },
      {
        in: 'off',
        out: 'off',
      },
    ],
  },
  on_off_domains: {
    values: [
      {
        in: 'light[s]',
        out: 'light',
      },
      {
        in: 'fan[s]',
        out: 'fan',
      },
      {
        in: 'switch[es]',
        out: 'switch',
      },
    ],
  },
  cover_states: {
    values: [
      {
        in: 'open',
        out: 'open',
      },
      {
        in: '(closed|shut)',
        out: 'closed',
      },
      {
        in: 'opening',
        out: 'opening',
      },
      {
        in: '(closing|shutting)',
        out: 'closing',
      },
    ],
  },
  cover_classes: {
    values: [
      {
        in: 'awning[s]',
        out: 'awning',
      },
      {
        in: 'blind[s]',
        out: 'blind',
      },
      {
        in: 'curtain[s]',
        out: 'curtain',
      },
      {
        in: 'door[s]',
        out: 'door',
      },
      {
        in: 'garage door[s]',
        out: 'garage',
      },
      {
        in: 'gate[s]',
        out: 'gate',
      },
      {
        in: 'shade[s]',
        out: 'shade',
      },
      {
        in: 'shutter[s]',
        out: 'shutter',
      },
      {
        in: 'window[s]',
        out: 'window',
      },
    ],
  },
  lock_states: {
    values: [
      {
        in: '[securely] locked',
        out: 'locked',
      },
      {
        in: 'unlocked',
        out: 'unlocked',
      },
    ],
  },
  bs_battery_states: {
    values: [
      {
        in: 'low',
        out: 'on',
      },
      {
        in: '(normal|charged)',
        out: 'off',
      },
    ],
  },
  bs_battery_charging_states: {
    values: [
      {
        in: 'charging',
        out: 'on',
      },
      {
        in: 'not charging',
        out: 'off',
      },
    ],
  },
  bs_carbon_monoxide_states: {
    values: [
      {
        in: '(detected|triggered|on)',
        out: 'on',
      },
      {
        in: 'clear',
        out: 'off',
      },
    ],
  },
  bs_cold_states: {
    values: [
      {
        in: 'cold',
        out: 'on',
      },
      {
        in: 'normal',
        out: 'off',
      },
    ],
  },
  bs_connectivity_states: {
    values: [
      {
        in: 'connected',
        out: 'on',
      },
      {
        in: 'disconnected',
        out: 'off',
      },
    ],
  },
  bs_door_states: {
    values: [
      {
        in: 'open',
        out: 'on',
      },
      {
        in: '(closed|shut)',
        out: 'off',
      },
    ],
  },
  bs_garage_door_states: {
    values: [
      {
        in: 'open',
        out: 'on',
      },
      {
        in: '(closed|shut)',
        out: 'off',
      },
    ],
  },
  bs_gas_states: {
    values: [
      {
        in: '(detected|triggered|on)',
        out: 'on',
      },
      {
        in: 'clear',
        out: 'off',
      },
    ],
  },
  bs_heat_states: {
    values: [
      {
        in: 'hot',
        out: 'on',
      },
      {
        in: 'normal',
        out: 'off',
      },
    ],
  },
  bs_light_states: {
    values: [
      {
        in: 'detected',
        out: 'on',
      },
      {
        in: 'no light',
        out: 'off',
      },
    ],
  },
  bs_lock_states: {
    values: [
      {
        in: 'unlocked',
        out: 'on',
      },
      {
        in: 'locked',
        out: 'off',
      },
    ],
  },
  bs_moisture_states: {
    values: [
      {
        in: 'wet',
        out: 'on',
      },
      {
        in: 'dry',
        out: 'off',
      },
    ],
  },
  bs_motion_states: {
    values: [
      {
        in: '(detected|triggered|on)',
        out: 'on',
      },
      {
        in: 'clear',
        out: 'off',
      },
    ],
  },
  bs_occupancy_states: {
    values: [
      {
        in: '(detected|triggered|on)',
        out: 'on',
      },
      {
        in: 'clear',
        out: 'off',
      },
    ],
  },
  bs_opening_states: {
    values: [
      {
        in: 'open',
        out: 'on',
      },
      {
        in: '(closed|shut)',
        out: 'off',
      },
    ],
  },
  bs_plug_states: {
    values: [
      {
        in: 'plugged in',
        out: 'on',
      },
      {
        in: 'unplugged',
        out: 'off',
      },
    ],
  },
  bs_power_states: {
    values: [
      {
        in: '(powered [on]|power detected)',
        out: 'on',
      },
      {
        in: '(not powered|powered off)',
        out: 'off',
      },
    ],
  },
  bs_presence_states: {
    values: [
      {
        in: '(home|present)',
        out: 'on',
      },
      {
        in: '(away|not (home|present)|gone)',
        out: 'off',
      },
    ],
  },
  bs_problem_states: {
    values: [
      {
        in: 'detected',
        out: 'on',
      },
      {
        in: 'ok',
        out: 'off',
      },
    ],
  },
  bs_running_states: {
    values: [
      {
        in: 'running',
        out: 'on',
      },
      {
        in: 'not running',
        out: 'off',
      },
    ],
  },
  bs_safety_states: {
    values: [
      {
        in: 'unsafe',
        out: 'on',
      },
      {
        in: 'safe',
        out: 'off',
      },
    ],
  },
  bs_smoke_states: {
    values: [
      {
        in: '(detected|triggered|on)',
        out: 'on',
      },
      {
        in: 'clear',
        out: 'off',
      },
    ],
  },
  bs_sound_states: {
    values: [
      {
        in: '(detected|triggered|on)',
        out: 'on',
      },
      {
        in: 'clear',
        out: 'off',
      },
    ],
  },
  bs_tamper_states: {
    values: [
      {
        in: '(detected|tampered with)',
        out: 'on',
      },
      {
        in: 'clear',
        out: 'off',
      },
    ],
  },
  bs_update_states: {
    values: [
      {
        in: 'update available',
        out: 'on',
      },
      {
        in: '(up to date|up-to-date)',
        out: 'off',
      },
    ],
  },
  bs_vibration_states: {
    values: [
      {
        in: '(detected|vibrating)',
        out: 'on',
      },
      {
        in: '(clear|not vibrating)',
        out: 'off',
      },
    ],
  },
  bs_window_states: {
    values: [
      {
        in: 'open',
        out: 'on',
      },
      {
        in: '(closed|shut)',
        out: 'off',
      },
    ],
  },
  shopping_list_item: {
    wildcard: true,
  },
  todo_list_item: {
    wildcard: true,
  },
  zone: {
    wildcard: true,
  },
  position: {
    range: {
      type: 'percentage',
      from: 0,
      to: 100,
    },
  },
  volume: {
    range: {
      type: 'percentage',
      from: 0,
      to: 100,
    },
  },
  timer_seconds: {
    range: {
      from: 1,
      to: 100,
    },
  },
  timer_minutes: {
    range: {
      from: 1,
      to: 100,
    },
  },
  timer_hours: {
    range: {
      from: 1,
      to: 100,
    },
  },
  timer_half: {
    values: [
      {
        in: 'half',
        out: 30,
      },
      {
        in: '1/2',
        out: 30,
      },
    ],
  },
  timer_name: {
    wildcard: true,
  },
  timer_command: {
    wildcard: true,
  },
  message: {
    wildcard: true,
  },
  search_query: {
    wildcard: true,
  },
  media_class: {
    values: [
      {
        in: 'artist',
        out: 'artist',
      },
      {
        in: 'album',
        out: 'album',
      },
      {
        in: '(track|song)',
        out: 'track',
      },
      {
        in: 'playlist',
        out: 'playlist',
      },
      {
        in: 'podcast',
        out: 'podcast',
      },
      {
        in: 'movie',
        out: 'movie',
      },
      {
        in: '[tv] show',
        out: 'tv_show',
      },
    ],
  },
  fan_speed: {
    range: {
      type: 'percentage',
      from: 0,
      to: 100,
    },
  },
  volume_step_up: {
    range: {
      type: 'percentage',
      from: 0,
      to: 100,
    },
  },
  volume_step_down: {
    range: {
      type: 'percentage',
      from: 0,
      to: 100,
      multiplier: -1,
    },
  },
};
