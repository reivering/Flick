# Flick — design direction

## Product brief

Flick is a browser-based way to send a picture from one device to another and see it immediately. It is for people who want to move a photo between a phone and a computer without an account or an app installation. Both devices open the same website; either can send or receive.

**Register:** product. The interface should feel special, but the transfer is the event, not the interface around it.

**Direction:** playful precision. Imagine a small physical photograph sliding across a quiet, ink-dark surface: tactile, direct, and a little surprising. The page should feel like a well-made instrument, not a marketing landing page or a cloud-storage dashboard.

**Character:** tactile, clear, quietly playful. **World:** a photograph passing from hand to hand across a dark tabletop. **Rich moments:** the selected photograph and its arrival on the receiving device. **Signature:** a single short directional trace that accompanies an intentional flick and appears nowhere else.

**Memorable moment:** after the sender swipes a selected picture upward, the photo travels off the phone and arrives on the receiver as a large, beautifully framed image. The animation suggests continuity between devices without pretending they know each other's physical location.

**Success:** a first-time user can connect two devices, send a picture, and see it on the receiving screen without instructions from another person. The primary path remains clear on a small phone and a large desktop.

## Principles

1. **Two choices, then one clear next step.** Start with Send and Receive. Each subsequent state has one obvious primary action.
2. **The picture is the hero.** Interface chrome recedes as soon as an image is selected or received.
3. **Connection should feel legible.** Show what to do, when devices are connected, and whether a transfer succeeded or failed.
4. **Play is optional; sending is dependable.** Swipe to flick on touch devices, with a visible Send button and full keyboard support.
5. **Earn trust with specifics.** Explain the 24-hour retention period in plain language; do not claim deletion, encryption, or peer-to-peer transfer unless implemented and verified.

## Experience and flows

### Home

Show a compact Flick wordmark, a brief promise — “Pictures, from here to there.” — and two large, distinct actions: **Send a picture** and **Receive a picture**. A small line explains “No app. No account.” A restrained illustrative photo frame and directional mark establish the gesture without competing with the choices.

The two actions have equal status. On desktop they sit side by side; on a narrow screen they stack, with labels and icons large enough to scan at a glance.

### Receive

1. Create a private receiving session and show a QR code plus a short, clearly grouped connection code. Label the code as temporary; show its actual expiry if applicable.
2. Explain: “On the other device, scan this code or enter the code at flick.” Use the actual deployment address in the finished product.
3. Keep the waiting state visible and calm: “Waiting for a device…” Provide a way back or to end the session.
4. When connected, say “Connected. Ready for a picture.” Do not imply that a file has arrived yet.
5. When an image arrives, display it prominently with its original aspect ratio, a **Download** action, an accurate expiry time, and an option to receive another picture. Acknowledge that an image saved by the user remains on their device after server deletion.

The QR code must contain a secure session link, be scannable using the phone's normal camera, and have sufficient contrast and a quiet zone. The short code is a convenient alternative for a laptop or for users who cannot scan. If a user chooses Receive on a phone, the other device can enter the displayed code.

### Send

1. Offer **Scan QR code** where camera access is supported and **Enter code** on every device. A QR link opened by the device's normal camera can lead directly to the send session.
2. Ask for camera permission only after the scan action. If permission is denied or scanning is unavailable, preserve the code-entry route.
3. After connection, open a native image picker. On desktop, optionally allow drag and drop into the same clearly labelled selection area.
4. Preview the selected image with its filename, a replace control, and a clear **Flick to send** button. On a touch screen, also say “Swipe up to flick.” A swipe is an enhancement, not the only way to send.
5. Show sending progress when measurable, followed by a confirmation only when the server confirms the transfer. Offer **Send another**.

The initial version handles one image at a time. Validate supported image types and size at both selection and upload; communicate the actual limits before upload. Avoid claiming support for formats until they are tested.

### Retention and access

Images are available for **up to 24 hours from upload**, then automatically deleted from storage and their associated database records. The product must enforce expiry on access as well as through a scheduled cleanup job; cleanup must remove the actual file, not just its metadata. Do not present the feature as working until storage and cleanup are configured and verified. Expiring, unguessable session credentials should protect access; short codes need limited attempts and a short lifetime.

The browser loads image data in order to display it, but does not need to save a permanent file to Downloads. A user-initiated download creates a separate copy outside Flick's control. Avoid third-party QR generation or analytics that expose session links, codes, or image contents.

## Visual system

### Color

**Commitment:** restrained. Nearly neutral ink carries the surface; acid lime marks the primary action or selection, used sparingly. The photograph supplies the rich, changing color. Semantic colors are reserved for meaningful states.

Use semantic tokens rather than hardcoded repeats:

```css
:root {
  --bg: oklch(19% 0.018 255);
  --surface: oklch(24% 0.020 255);
  --surface-raised: oklch(29% 0.021 255);
  --ink: oklch(96% 0.012 95);
  --muted: oklch(77% 0.018 100);
  --line: oklch(43% 0.022 255);
  --accent: oklch(89% 0.18 118);
  --accent-ink: oklch(20% 0.025 125);
  --secondary: oklch(82% 0.10 48);
  --danger: oklch(77% 0.14 25);
  --focus: oklch(91% 0.14 118);
}
```

Verify actual contrast in the implementation, including muted text and disabled states. Color is never the sole indicator of status. QR codes should use a reliably scannable dark-on-light treatment.

### Typography

Use **DM Sans** for the wordmark, body text, controls, and larger expressive headings. Pair it with **Space Mono** for codes and operational details. Use weights 400 and 500, with 600 reserved for rare emphasis; build hierarchy through size and color. Provide sensible local fallbacks and ensure the product remains usable if font requests fail.

- Display: `clamp(2.75rem, 7vw, 6.5rem)`, tight but never clipped; short, sentence-case phrases.
- Section title: `clamp(1.5rem, 3vw, 2.5rem)`.
- Body: 1rem–1.125rem with generous line height.
- Meta and labels: at least 0.875rem; avoid low-contrast microcopy.
- Connection codes: monospaced, generously spaced, selectable, and readable without relying on letter spacing alone.

### Layout and surfaces

Use a full-height canvas with a compact top bar and a generous, asymmetric working area. On wide screens, place the headline and short instructions to one side and the active transfer surface on the other. On mobile, prioritize the action and image preview above decorative content.

Constrain readable copy to about 38–52 characters per line and the application shell to approximately 1280px. Use a 4px spacing grid, with larger breaks between stages. Keep main panel corners around 14–20px and controls around 8–10px, with nested radii accounting for padding. Use quiet hairline borders and surface steps for depth; reserve a soft neutral shadow for the photo itself if needed. Keep the background calm, without decorative grain or filler.

### Components

- **Primary action:** acid-lime fill, dark label, clear icon when useful, generous padding; at least 44 × 44 CSS pixels of interactive area. Keep other chrome neutral so the accent retains meaning.
- **Secondary action:** raised ink surface with a visible border; equally legible, without looking disabled.
- **Photo frame:** generous interior space, `object-fit: contain`, no cropping by default. Show portrait, landscape, and unusually large images gracefully.
- **Code field:** large monospaced value, grouped visually, with a labelled copy action and confirmation. Do not put a code only inside an image.
- **Status:** concise text with a supporting icon; distinguish waiting, connected, sending, success, and failure without relying on color alone.
- **Navigation:** a clear back action during setup and an explicit way to end an active session. Avoid accidental loss of a transfer in progress.

## Motion and interaction

**Lens:** restraint for setup and functional controls; a short moment of play for the transfer itself. Motion helps users understand what happened and never delays the task.

- A selected photo lifts slightly as the user begins a swipe, follows the finger, and exits upward when the gesture is completed. A short swipe or cancellation returns it to rest.
- The receiver's photo settles into its frame only after receipt succeeds. Do not synchronize animations in a way that suggests arrival before data is available.
- Buttons provide immediate feedback. Use short, subtle transitions (roughly 120–200ms); keep the transfer animation around 300–500ms and interruptible. Animate transform and opacity rather than layout properties; avoid looping decoration and catch-all transitions.
- Honor `prefers-reduced-motion`: remove simulated travel and spring effects; use immediate state changes or a brief opacity change. Keep the same controls and outcomes.
- Do not require physical phone movement, device motion permissions, hover, or precision gestures to complete a transfer.

## Responsive and accessibility requirements

- Support at least 320px through large desktop widths, portrait and landscape, without horizontal scrolling or clipped controls.
- Respect safe-area insets and dynamic mobile browser heights. Avoid fixing essential controls behind browser chrome or the keyboard.
- Use semantic headings, buttons, links, inputs, and a labelled file picker. Make the flow fully usable with keyboard and screen reader.
- Provide visible focus, logical focus order, meaningful error messages, and an accessible live status for connection and transfer updates. Do not move focus unexpectedly.
- Make touch targets at least 44 × 44 CSS pixels. Maintain readable text and tested contrast, including the QR code and focus ring.
- The flick gesture must have a single-tap and keyboard alternative. Do not auto-open a camera, request motion access, or rely on drag alone.
- Preserve image proportions; provide meaningful image alternative text where available, otherwise identify it as the selected or received image without inventing its contents.

## Copy and states

Voice is friendly, direct, and brief. Use “picture,” “send,” “receive,” and “code” consistently. Avoid technical jargon, exaggerated privacy claims, fake urgency, and promises the system cannot verify.

| State | Suggested copy | Action |
| --- | --- | --- |
| Waiting | “Waiting for a device…” | Show QR and code |
| Connected | “Connected. Ready for a picture.” | Choose a picture |
| Uploading | “Sending your picture…” | Show progress if known |
| Sent | “Picture sent.” | Send another |
| Received | “Picture received.” | Download or receive another |
| Invalid or expired code | “That code isn't valid anymore.” | Try another code |
| Connection lost | “Connection lost. Let's reconnect.” | Retry or start again |
| Upload failed | “Couldn't send that picture.” | Retry; retain the selected image where possible |
| Expired image | “This picture is no longer available.” | Start a new transfer |
| Unsupported or oversized file | Explain the actual type or size limit | Choose another picture |
| Camera unavailable | “Can't use the camera here.” | Enter a code |

Expiry information should use a human-readable local time when available, supplemented by the plain-language 24-hour rule. Never show a successful transfer or deletion without confirmation from the system.

## Implementation and verification notes

This is a design and product specification, not a claim that Flick is already built. Select the framework, storage provider, connection method, and hosting based on the implementation environment. The minimum production system needs secure upload and retrieval, private sessions, storage lifecycle enforcement, scheduled deletion, and appropriate abuse controls. Use HTTPS for deployment. A server-backed upload is consistent with the requested 24-hour availability; do not describe it as direct device-to-device transfer unless that is how the final implementation actually works.

Apply the project-local Unslop skill to the built interface: audit the rendered screen, then review spacing, color, icons, copy, typography, layout, details, visuals, and motion in that order. Use one consistent icon set and avoid emoji icons, gradients, glows, decorative motion, unverified claims, and template-like filler. Keep interface labels in sentence case and omit trailing punctuation from short labels. Preserve Flick's actual features and its two equally important opening choices. Since no interface exists yet, this document defines the direction; an audit must wait for a working screen.

Unslop was created by [Damir Sokolovsky](https://x.com/heydamir); its [source repository](https://github.com/heydamir/unslop) is licensed under CC BY 4.0. The project-local copy and its license are in `.agents/skills/unslop/`.

Before launch, test the full flow on a real phone and computer in both directions, including QR and manual code entry. Verify image rendering, download, expiry and actual file deletion, inaccessible expired links, upload failures, invalid codes, denied camera access, keyboard use, reduced motion, and small screens. Review at 320, 768, 1280, and 1920 CSS pixels, and test on a slow connection. Check that browser refreshes and session expiration produce honest, recoverable states.

## Out of scope for the first version

Accounts, a gallery or transfer history, multi-file batches, video, physical phone-motion detection, automatic device discovery, and social features. Add them only when the core picture transfer is reliable.


## File-sharing update

Flick now shares one file at a time, smaller than 1 GB. Send and Receive use the same connection flow; supported images are previewed and other files are presented with their name and size. All files have a download action and expire after 24 hours. Show upload progress and keep the tap-to-send alternative to the swipe. Preserve files unchanged rather than converting images; filenames and content may contain personal information.


## Current visual direction: monochrome

Flick uses a minimalist black, white, and gray interface. Use quiet borders and whitespace, a white primary action, a neutral secondary action, and a simple outlined file illustration. Uploaded image previews retain their original colors. This direction supersedes the earlier lime-accent palette and decorative photograph concept.
