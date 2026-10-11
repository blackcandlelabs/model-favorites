# pi-model-favorites

A favorites screen for [Pi](https://pi.dev), the coding agent.

Keep a shortlist of the models you actually use and switch between them without
typing provider paths.

## Install

```bash
pi install git:github.com/blackcandlelabs/model-favorites
```

## Commands

| Command | What it does |
|---|---|
| `/addfav` | Add the model you are currently on to your favorites |
| `/subfav` | Remove the current model. You can also pass an id: `/subfav gpt-5.5` — no need to switch to the model first |
| `/favorites` | Open the favorites screen: search, arrow keys, `enter` to switch, `esc` to close |

The built-in `/model` command is left untouched. Favorites are stored in
`~/.pi/agent/model-favorites.json` as a list of `provider/model` ids, oldest
first, so you can also edit them by hand.

## Notes

- A favorite whose provider isn't logged in is skipped with a notice instead
  of hiding the rest of the list.
- Works in interactive mode; in RPC/print mode `/favorites` says it needs the
  terminal UI while `/addfav` and `/subfav` keep working.
