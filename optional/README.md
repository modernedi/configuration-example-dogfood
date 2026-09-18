# Optional: prove an order/invoice conversation

The base bundle works without these files. A mapping handles one document;
this scenario connects two documents and their evidence:

- An incoming 850 must map successfully.
- An outgoing 810 must respond to that order within 30 days and carry the same
  purchase-order number.
- The invoice total must exist, and its AS2 receipt and 997/999 acknowledgment
  must be accepted.

The definition describes the conversation. The binding selects **Test traffic**,
the example retailer and the base bundle's two mappings. Its fact expressions
reuse the Mapper selector syntax (`ST->BEG(03)`, `ST->BIG(04)`, `ST->TDS(01)`).
Syntax-tree pins are omitted for convenient authoring; applying the binding
resolves and freezes exact runtime configuration for evidence.

To try the files locally, copy `scenario-definitions/` and `scenario-bindings/`
from this directory into `modernedi/`. Add the entries from
[`manifest-additions.json`](manifest-additions.json) to the matching `resources`
and `files` arrays in `modernedi/modernedi.json`, then run `npm run check`.
The base bundle's existing entries must stay in those arrays.

For a real workspace, use your own exported partner/mapping keys and review the
result with `plan`. Editing the definition changes its semantic content hash:
use ModernEDI's scenario validation/editor to obtain the new hash for the binding.
Published definition versions are immutable; don't repurpose this example's
identity for unrelated scenarios.

Applying the files publishes the definition and applies the binding. It **does
not start a run, send a document, or prove success**. After configuring a real Test
partner, start a custom scenario in the workspace or through scoped scenario-run
API access and attach actual matching Test transactions. The `.invalid` example
endpoints cannot be used for that live step. The CI runner's saved-case results
and a live scenario's transport/conversation evidence answer different questions.

See the [scenario reference](https://www.modernedi.com/docs/scenarios/reference)
for authoring, lifecycle and evidence requirements.
