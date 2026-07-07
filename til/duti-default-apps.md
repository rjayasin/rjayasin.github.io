# Set default apps from the command line with duti

macOS has no built-in command for changing which app opens a given file type — the supported path is right-clicking a file in Finder, Get Info, changing "Open with:", and clicking "Change All…", one file type at a time. [duti](https://github.com/moretension/duti) is a small CLI that does the same thing through Launch Services:

```
brew install duti
```

## Example: open all .md files in VS Code

duti identifies apps by bundle ID, which you can look up with osascript:

```
$ osascript -e 'id of app "Visual Studio Code"'
com.microsoft.VSCode
```

Then point the extension at it:

```
duti -s com.microsoft.VSCode .md all
```

The last argument is the role: `viewer`, `editor`, `shell`, `none`, or `all`. For "double-clicking in Finder opens this app", use `all`. The change takes effect immediately — no logout or restart needed.

Verify with `-x`, which prints the current handler for an extension:

```
$ duti -x md
Visual Studio Code
/Applications/Visual Studio Code.app
com.microsoft.VSCode
```

## Notes

- duti can also apply a whole settings file of `bundle_id  ext/UTI  role` lines (`duti ~/.config/duti/settings`), which makes it easy to keep all your file associations in dotfiles and reapply them on a new machine.
