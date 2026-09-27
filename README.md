# Teekega visual

**English** · [Русский](README.ru.md)

A static, browser-only visualizer for JSON exports of Telegram chats.
Load the file, pick a mode - everything is parsed and rendered locally, nothing leaves the page.

## Modes

| Mode | Description |
| --- | --- |
| **Bar Chart Race** | Top words racing over a sliding window |
| **Line Chart Race** | Trend lines with a peak-ranking finish |
| **Heatmap** | GitHub-style daily activity calendar |
| **Punch Card** | Hour-of-day × day-of-week rhythm |
| **Balance of Power** | Who talks more, who initiates, response times, unique lexicon, golden day |
| **Ngram Tracker** | Frequency of any word over time |
| **Bubble Timeline** | Scatter of days by message count / avg length / content type |
| **T9 of your chat** | Markov-chain phrase generator per user |
| **Open Words** | "Word Pokédex" - which top-frequency Russian words your chat has and hasn't used |

## Usage

1. Export a Telegram chat as JSON (in the desktop client: chat menu → *Export chat history* → JSON).
2. Open [`index.html`](index.html) in a modern browser, or serve the folder:
   ```
   python -m http.server 8000
   ```
3. Drop the `result.json` onto the upload zone.

Parsing runs in a Web Worker, so multi-hundred-megabyte exports don't freeze the UI.

## Files

```
index.html         entry point
app.js             module dispatch
upload.js          file input + Web Worker parser
styles.css         theme + all visualization styles
css/markov.css     T9 mode styles
{module}.js        one file per visualization
```

## License

MIT - see [LICENSE](LICENSE).

Frequency dictionary for the *Open Words* mode is derived from
[hermitdave/FrequencyWords](https://github.com/hermitdave/FrequencyWords) (CC-BY-SA 4.0).
