# Editor manual tests

Checks for editor 2.0.0 that the automated tests can't make, because they need a real
VS Code window. Run them before the release, in an editor built from the
`references-refactor` branches of editor and services, on the migrated content
(content `references-refactor`, or `content/yp-94-chapter-26` once it's merged there).

Unless a check says otherwise, it uses any file with references. File names are under
`content/` in the content repo.

## Tokens in the text

1. Backspace right after a reference removes the whole reference. Delete right before
   one does the same.
2. The caret steps over a reference with the arrow keys and never lands inside it.
3. A mouse selection that starts or ends inside a reference extends to take the whole
   reference.
4. Undo after deleting a reference brings it back with its template and targets. Redo
   deletes it again.
5. Copy a passage with references and paste it in the same file and in another file's
   panel. The pasted references render in the target panel. Save both files, and
   `check-refs` reports no problems.
6. Copy a reference into another file and edit the copy. The original is unchanged.
7. `[[term]]` editing still works: typing `[[`, renaming a term and the terms panel.
8. Delete a block holding references, and a list item holding one. Save, and the list
   has no leftover items.

## How references show

9. Open a chapter and a section. Each reference shows as the site renders it, with
   brackets and an underline on the linked part. Hovering a link shows its target.
10. Capitalization: a reference at the start of a field, after `.`, `?` or `!`, and at
    the start of `**...**` is capitalized. Type before a reference to move it into and
    out of a sentence start, and the capital follows.
11. Error states show the reference in red with a wavy underline and the reason on
    hover:
    - edit the templates file on disk to break or remove a template the open file uses;
    - paste a reference into a formula's content;
    - wrap a reference in `$...$`.
12. Fix the templates file on disk. The references recover without reopening the panel,
    and the pop-up for the problem appeared while it was broken.
13. Break `entity-labels.json` in services. Every reference shows the registry error.
    Restore it afterwards.
14. Reorder embeds so the numbering changes and save. References in other open panels
    show the new numbers.
15. A long reference with several targets wraps sensibly at the end of a line.
16. Light, dark and high-contrast themes: the reference colour, the error colour on
    purple and the popup all read well.
17. The sidebar tree has no reference items under entities, sections or chapters.

## Creating a reference

18. In `08-a-miller-rabin-tanuk-szama.yaml` (section 24.8), type `[` after "Ha $n$ ",
    then `prím`, then Enter. `[prím]` appears. Save: the list gains
    `{ text: prím, target: definitions.primtulajdonsagu-elem.terms.prime }` at the right
    index, and the later references are renumbered.
19. Undo once removes the new reference. Redo restores it.
20. Type `[prím` fast. Every letter lands in the search box, none in the text. Repeat on
    a Hungarian keyboard, where `[` takes Option or AltGr.
21. `[` inside `$...$`, inside `^...^` and after an unclosed `$` types a plain `[`.
22. `[[` in a definition gives `[[]]` and the term flow as before. In a section file the
    second `[` does nothing.
23. In a figure lead-in, `[` then `*` inserts `[*]`.
24. Create a theorem reference: search `23.10`, pick it, choose `a [23.10. Tétel]ben`,
    check the preview at the caret, and confirm.
25. Tab on a term hit opens Text mode with that text, ready to edit.
26. Select a word and type `[`. The word is the search and the link text, and
    confirming replaces it. With a selection across lines or one holding a reference,
    `[` opens at the caret and replaces nothing.
27. Enter a URL, `https://hu.wikipedia.org/wiki/Prímszám`, with the text `Wikipedia`.
28. Pick a target in the sidebar while the popup is open. Start another pick and cancel
    it with Escape: both the pick and the popup close.
29. In the sidebar, pick a claim inside a subsection. A notice says it can't be a
    reference target.
30. The popup opens in every text field that reads references, including the figure
    caption and the quote, and in none of formula content, claim formula or typewriter
    rows.

## Editing a reference

31. Click a reference. The popup opens below it and the reference is highlighted.
    Change the template: the reference updates live. Escape restores it.
32. F2 with the caret next to a reference, and Enter on a selected reference, open the
    popup. Check that VS Code doesn't take F2 first. If it does, F2 needs to become
    Ctrl+Enter.
33. Clicking a reference in another field while a popup is open closes the first popup
    without changes and opens the second.
34. In chapter 24, edit the four-chapter list `a [18.], [20.], [22.] és [23. fejezet]ekben`:
    add chapter 21, remove chapter 20, then check the preview and the saved `targets`.
35. Add chapter 24 to a single `a [23. fejezet]`. The popup keeps `the-index-chapter`,
    says it takes exactly 1 target, and blocks Apply until a list template is chosen.
36. Build a mixed list of 23.9. Definíció, 23.10. Tétel and 24.16. Tétel with
    `each-the-index-label`. The target list shows the two groups.
37. Switch an item to Text, edit it and confirm. On an item with two targets, the switch
    is disabled with the reason.
38. Open (↗) on a target opens its panel, or the browser for a URL.
39. A reference whose target was renamed shows "not found" and Re-pick.
40. A damaged reference, typed as `[@zz]`, shows the reason and offers only Remove.
41. Edit the templates file on disk while a popup is open. The target list and the
    previews refresh.
42. With a broken label registry, the popup shows the registry message.

## Popup placement

43. A reference on the last visible line: the popup opens above it. In a narrow pane
    the popup scrolls inside. A reference wrapped over two lines: the popup covers
    neither line.
44. Scroll with the popup open: it follows the reference. Scroll the reference out of
    view: the popup closes.
