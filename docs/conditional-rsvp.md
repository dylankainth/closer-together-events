# Go if a friend goes

Selecting **Go if Sam goes** saves Maybe plus Sam's identity. When Sam RSVPs Going, the event
returns to the viewer's picks with a prompt to confirm. Their answer remains Maybe until they
explicitly tap **Confirm going**.

Confirmation reads the saved friend and their current RSVP in the same mutation that changes
the viewer's answer. If Sam changed to Maybe/Not going, left the guest list, or is no longer a
friend, a stale confirmation writes nothing. A different friend going never satisfies Sam's
condition. Repeating a successful confirmation is harmless.

Changing the viewer's answer clears the condition. Snoozing a ready prompt continues to hide it
for the existing snooze period. Waiting and declined states remain visible on the guest event
page. This uses live in-app queries; it adds no push notifications or automatic RSVPs.
