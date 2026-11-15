# Markdown Paper

Turns Markdown documents into typeset PDFs without a separate TeX installation.

## Language

**Document**:
A Markdown file that starts with YAML frontmatter.
_Avoid_: Paper, essay, source

**Metadata**:
The frontmatter fields of a document, which fill in a template.
_Avoid_: Properties

**Template**:
The LaTeX file a document is poured into: the bundled default or a custom one.

**Build**:
One run that turns the chosen documents into PDFs, each succeeding or failing on its own.
_Avoid_: Compile, render

**Word count**:
The approximate number of words in a document's counted region, broken down by section.

**Counted region**:
The part of a document between the start and end word-count markers, or all of it without them.
