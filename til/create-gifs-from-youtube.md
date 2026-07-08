---
added: 2026-07-01
tags: [youtube, cli, yt-dlp, ffmpeg, gifs]
---

# Create gifs from youtube videos with yt-dlp and ffmpeg

I wanted to send a ~2 second clip from a YouTube video as a gif in iMessage. The pipeline that worked: `yt-dlp` downloads just the section you want, `ffmpeg` does a two-pass palette encode, and `gifsicle` shrinks the result.

## The commands

```
# download just the selection (video only — gifs are silent)
yt-dlp --download-sections "*76.48-78.57" --force-keyframes-at-cuts \
  -f "bv*[height<=1080]/b[height<=1080]" --remux-video mp4 -o "clip.%(ext)s" \
  "<video-url>"

# reuse the source's native frame rate so motion isn't altered
fps=$(ffprobe -v error -select_streams v:0 -show_entries stream=r_frame_rate -of csv=p=0 clip.mp4)

# two-pass palette encode — bayer dither compresses far better than error diffusion
ffmpeg -y -i clip.mp4 -vf "fps=$fps,scale=800:-1:flags=lanczos,palettegen=stats_mode=diff:max_colors=128" -update 1 palette.png
ffmpeg -y -i clip.mp4 -i palette.png -lavfi "fps=$fps,scale=800:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=3" -loop 0 output.gif

# lossy second pass: the biggest single size win (~35-45%)
gifsicle -O3 --lossy=80 output.gif -o output.gif

# the palette is only needed during encoding
rm palette.png
```

Once I had these commands working, I built a small tool around them — [gif-helper](/gif-helper/) — paste a YouTube link, scrub sliders to pick the start/end of the clip, preview the loop, and copy the generated commands.

## What actually mattered for size vs. quality

GIF has no inter-frame prediction and relies on palette + LZW compression, so file size scales quickly with resolution, frame rate, color count, and dithering noise.

- **Dithering algorithm matters more than resolution.** Switching `paletteuse` from `sierra2_4a` (the default) to `bayer` produced smaller files even at higher resolution — error-diffusion dithering adds high-frequency noise that hurts LZW compressibility, while ordered dithering compresses better.
- **`dither=none` didn't help** despite normally being the most compressible option — a clip with enough motion/gradient rarely forms flat-color runs, so LZW gains little.
- **`gifsicle -O3 --lossy=N`** as a second pass after ffmpeg gave the single biggest size reduction (~35-45%) with minimal visible quality loss.
- **Match the source's native frame rate** instead of picking an arbitrary fixed value — probe `r_frame_rate` with `ffprobe` and feed it to the `fps` filter so motion isn't altered. Downsampling fps is a valid size lever, but it should be a deliberate choice.
- **iMessage only auto-loops actual `.gif` files inline.** An MP4/MOV attachment shows as a tap-to-play video, not an autoplaying loop — so gif remains the right format despite being far less efficient than a video codec.

## Rough sense of the levers

From a 1080p source, a ~2s clip at 800px wide / native fps / 128 colors / bayer dither / `--lossy=80` came out around 4.3 MB. Dropping to 640px / 15fps / `--lossy=100` got it to 1.6 MB; a 960px / 256-color version was 6.5 MB. Resolution, color count, and lossy level are the knobs to turn when the first attempt is too big.
