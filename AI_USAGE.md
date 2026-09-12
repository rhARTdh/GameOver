# AI assistance disclosure

GameOver was conceived and directed by Rudolf Hellmut Hartwig as a solo ETHOnline 2026 project. Product intent, economic choices, role language, visual constraints and the decision to keep v4 on Sepolia were supplied and approved by Rudolf.

ChatGPT and Codex were used as implementation collaborators for v4. Their assistance included:

- translating the approved checklist into `V4_SPEC.md`;
- drafting and refining `GameOverEncounter.sol`;
- implementing the static browser interface in `index.html`, `styles.css`, `app.js`, `core.js` and `config.js`;
- writing the automated tests under `tests/`;
- performing local contract, browser, accessibility and responsive-layout checks; and
- drafting the deployment, security and rehearsal documentation in `README.md`.

The product decisions recorded in `V4_SPEC.md` are the controlling human-approved specification. AI suggestions that conflicted with those decisions were not treated as authority.

The vendored QR implementation in `vendor/qrcode.js` is third-party MIT-licensed software, not AI-generated code; its source and notice are recorded in `THIRD_PARTY_NOTICES.md`.

No AI service is called by the v4 application at runtime. The Build Status view explicitly labels AI description structuring as simulated by user-entered text. The v4 package also leaves deployment to the project owner: it contains no private keys, wallet credentials or preconfigured v4 contract address.

Before any public demo or deployment, the project owner remains responsible for reviewing the generated code, confirming MetaMask transactions, verifying the deployed source and accurately describing the prototype’s limitations.
