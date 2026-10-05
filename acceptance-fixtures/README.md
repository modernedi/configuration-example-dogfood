# Temporary conversation release acceptance

These synthetic bundles package the downloadable supplier, partial-fulfillment,
and motor-carrier examples with the disposable workspace's existing synthetic
partner. They contain no credentials or real customer data.

Only `supplier-order-fulfillment` is proposed for the protected reviewed apply.
The other positive bundles are planned and verified without applying them.
`expected-failure` changes one expected result deliberately: the full order
actually passes, so expecting failure must make verification fail.

The approved apply job first checks that the server rejects that failed result
and rejects a passing result for a different bundle. These expected HTTP 412
responses are successful tests, not intentionally failed CI jobs. It then uses
the ordinary published runner for the passing, exact reviewed apply.

This exercise sends no EDI and does not prove AS2 delivery or partner acceptance.
The original `modernedi` directory remains untouched for the reviewed restoration.
After restoration, these temporary files and workflow changes are removed by a
normal commit and the original paused CI setting is restored.
