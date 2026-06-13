I want you to act as a senior frontend/product engineer, technical designer, and product-minded web developer.

Your task is to build a marketing and information website for a browser-based WebGL Minecraft-like voxel game prototype.

This is being used as a model capability benchmark. I will run the result locally and compare different models based on tooling decisions, implementation quality, design quality, maintainability, accessibility, performance, content quality, and whether the chosen technical approach is appropriate for the type of site.

Do not stop to ask clarification questions. This is a benchmark prompt. If anything is ambiguous, make the best product/design/engineering decision you can, explain the assumption briefly, and continue implementing. Do not block progress waiting for user input.

The website should feel like a real landing page for an indie voxel sandbox game, not a generic placeholder page.

Important scope boundary:

* This prompt is for building the marketing/information website for the game, not rebuilding the playable game itself.
* Do not implement the WebGL voxel game in this benchmark unless a minimal embed/link is already present in the project and useful for the site.
* Use real game screenshots from the first benchmark if they exist.
* If screenshots are missing, handle that honestly with clearly labelled placeholders and instructions for adding the real screenshots later.

Important context:

* The game is a browser-based WebGL Minecraft-like voxel sandbox prototype.
* The game includes procedural terrain, chunks, creative flight, gravity-based movement, block breaking/placing, menus, settings, view distance, clouds, and screenshot capture.
* The first benchmark produced or should produce screenshots such as:

  * `screenshots/main-menu.png`
  * `screenshots/in-game.png`
* Use those screenshots if they exist.
* If screenshots are missing, create tasteful placeholder sections and clearly state that real screenshots should be added later.
* Do not use copyrighted Minecraft assets.
* Do not pretend this is an official Minecraft product.
* Do not copy Minecraft branding, logos, art, or text.

Framework/tooling decision requirement:

* You must choose the framework/tooling yourself.
* Do not ask me what framework to use.
* Pick what you think is the most appropriate option for this type of site.
* Explain why you chose it.
* Also explain why you did not choose heavier or lighter alternatives.
* The choice itself will be scored.
* Avoid overengineering.
* Avoid underengineering.
* Prefer the simplest stack that still produces a polished, maintainable, performant result.
* If you choose React, Astro, Svelte, plain HTML/CSS, Vite, Next.js, or anything else, justify the choice based on this project’s needs.
* The site should be easy to run locally and easy to deploy as a static site if practical.

Core website requirements:

* Build a polished marketing/info website for the game.
* The site must include at least:

  * Hero section
  * Short game pitch
  * Screenshot or visual showcase section
  * Features section
  * Controls section
  * Technical highlights section
  * Development/status section
  * Call-to-action section
  * Footer
* The page should explain what the game is, why it is interesting, and what features it has.
* The page should feel specific to this game, not like a generic SaaS landing page.
* The content should be written as if the game is a real playable prototype.
* The copy should be clear, concise, and not overhyped.
* The design should be visually appropriate for a voxel sandbox game.
* The page should work well on desktop and mobile.
* The design should use the game screenshots if available.

Content requirements:

* Write all website copy yourself.
* Do not use lorem ipsum.
* Do not use vague filler like “amazing experience” without saying what is actually interesting.
* Mention the game’s actual features, such as:

  * Procedural voxel terrain
  * Chunk-based world loading
  * Creative flight
  * Gravity-based movement
  * Block breaking and placement
  * View distance settings
  * Procedural clouds
  * Biome-like terrain variation
  * Caves or cave openings
  * Trees, beaches, hills, mountains, and water
* Include a controls section with clear controls, for example:

  * WASD movement
  * Mouse look
  * Space jump / fly up
  * Double-tap Space toggle flying
  * Shift or Ctrl fly down
  * Mouse buttons for block breaking/placing
  * Escape pause
* Include a technical section that explains the project in a way that would interest developers without overwhelming normal users.
* Include honest project status language. This is a prototype, not a finished commercial game.

Visual/design requirements:

* Create a strong visual identity suitable for an indie voxel sandbox game.
* Use a cohesive colour palette.
* Use clean typography.
* Use spacing, layout, and hierarchy well.
* Include game-like visual details where appropriate, such as blocky cards, pixel/voxel-inspired accents, terrain layers, sky/cloud motifs, or grid details.
* Do not make the design look like a corporate SaaS dashboard unless you intentionally justify that decision.
* Do not rely entirely on huge gradients and generic cards.
* The page should look good in a screenshot.
* The design should be responsive.
* The main CTA should be clear.
* The screenshot/visual showcase should be prominent.

Screenshot/image requirements:

* If `screenshots/main-menu.png` and/or `screenshots/in-game.png` exist, use them in the site.
* If the framework/build setup copies static assets from a public/static folder, include instructions for where to place the screenshots.
* Do not fake game screenshots if the real files are missing.
* If using placeholders, label them clearly as placeholders.
* Include alt text for all images.
* Prefer using the in-game screenshot as the main visual if available.
* The site should still build and look acceptable if screenshots are missing.

Accessibility requirements:

* Use semantic HTML.
* Use accessible buttons and links.
* Ensure good colour contrast.
* Ensure keyboard navigation works for links/buttons.
* Include useful alt text.
* Do not make important content only available through animation or hover effects.
* Respect reduced motion preferences where practical.
* Avoid tiny text.

Performance requirements:

* The site should be fast and lightweight.
* Avoid unnecessary client-side JavaScript.
* Avoid heavy dependencies unless justified.
* Optimise images where practical.
* Do not ship a large app framework if a simpler static approach would be better, unless you justify it well.
* Avoid layout shifts.
* Use sensible asset loading.

Implementation requirements:

* Use TypeScript if the chosen stack benefits from it.
* Keep the code organised and maintainable.
* Avoid overuse of `any`.
* Avoid a large messy single file unless the chosen approach genuinely makes that appropriate.
* Include or update `package.json` scripts for development, building, previewing, and any tests/checks you add.
* Include setup and run instructions.
* Include a production build command.
* Include a preview command if supported by the chosen tooling.
* The project should run locally with clear commands.

Recommended commands:

You may choose the exact package manager and tooling, but include equivalent commands for:

```bash
install dependencies
run dev server
run production build
preview production build
```

If working in an existing Bun-based repo, prefer Bun commands unless there is a good reason not to.

Quality/testing requirements:

* Include at least a basic verification checklist.
* Include any lint/typecheck/build commands that are relevant to your chosen stack.
* If you include automated checks, keep them appropriate for the project.
* Do not add a heavy test setup just to look impressive.
* If practical, include a simple screenshot capture or visual review command for the landing page.
* If you cannot run commands in your environment, state that clearly and explain exactly what I should run locally.
* Do not claim commands pass unless they have actually been run successfully in the current environment.

Decision-making requirements:

* Explain your tooling choice.
* Explain trade-offs.
* Explain why the stack is not overkill for this site.
* Explain why the stack is not too limited for this site.
* If you choose a very simple stack, explain how it remains maintainable.
* If you choose a framework, explain what value it adds.
* Prioritise good judgement over novelty.

No fake compliance requirements:

* Do not fake features in comments.
* Do not claim the site uses screenshots unless the implementation actually references screenshot files.
* Do not claim accessibility/performance work was done unless it is reflected in the code.
* Do not leave critical sections as TODOs.
* Do not silently omit required sections.
* Do not provide only pseudocode.
* Do not mark a feature as implemented unless the code path exists and can be tested.
* If a requirement is missing or only partially implemented, mark it as missing or partial honestly.
* Do not hide missing features behind comments, empty components, placeholder classes, or optimistic claims.
* Prefer a complete, polished, appropriately scoped site over a huge overengineered one.

Deliverables:

1. Brief product/design interpretation.
2. Tooling/framework choice and justification.
3. Trade-off explanation, including why the choice is not overkill.
4. Implementation plan.
5. Full implementation, showing every file that should be created or modified.
6. Setup and run instructions.
7. Build/preview instructions.
8. Notes on where screenshots should live and how they are used.
9. Accessibility notes.
10. Performance notes.
11. Verification checklist.
12. Limitations and suggested next improvements.
13. Honest self-critique.

The final checklist must include at least:

* Local setup works
* Dev server works
* Production build works
* Preview works, if supported
* Framework/tooling choice is justified
* Site has a hero section
* Site has a game pitch
* Site has a screenshot/showcase section
* Site has a features section
* Site has a controls section
* Site has a technical highlights section
* Site has a development/status section
* Site has a CTA section
* Site has a footer
* Site is responsive
* Site uses semantic HTML
* Site has accessible links/buttons
* Images have alt text
* Colour contrast is considered
* Site avoids unnecessary heavy dependencies
* Site uses real screenshots if available
* Missing screenshots are handled honestly
* No fake compliance or placeholder-only sections

Scoring guidance:

Higher-quality answers should score better for:

* Sensible framework/tooling choice
* Clear justification of technical decisions
* Good judgement around simplicity vs maintainability
* Strong visual design
* Good game-specific copy
* Good responsive layout
* Good accessibility
* Good performance
* Real screenshot integration
* Clean implementation
* Clear setup/build instructions
* Honest self-critique

Lower-quality answers should score worse for:

* Overengineered stack without justification
* Underpowered stack that makes the result hard to maintain
* Generic SaaS-looking design
* Generic filler copy
* Missing required sections
* Poor mobile layout
* Poor accessibility
* Heavy dependencies with no reason
* Fake screenshot usage
* Placeholder sections marked as complete
* Claims that do not match the implementation
* Asking clarification questions instead of making a decision

Begin by briefly explaining your product/design interpretation, then choose the tooling, justify it, plan, and implement.
