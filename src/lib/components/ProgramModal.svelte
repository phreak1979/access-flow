<!-- Program Outcome Modal -->
{#if showProgramOutcomeModal}
  <div class="modal fade show d-block" tabindex="-1" role="dialog">
    <div class="modal-dialog modal-lg modal-dialog-scrollable">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">{poForm?.id ? "Edit" : "Add"} Program Outcome</h5>
          <button class="btn-close" on:click={() => (showProgramOutcomeModal = false)}></button>
        </div>
        <div class="modal-body">
          <div class="row g-3">
            <div class="col-12 col-md-3">
              <label class="form-label">Code</label>
              <input class="form-control" bind:value={poForm.code} placeholder="OLO1" />
            </div>
            <div class="col-12 col-md-4">
              <label class="form-label">Category</label>
              <select class="form-select" bind:value={poForm.category}>
                <option value="KNOWLEDGE">Knowledge</option>
                <option value="SKILL">Skill</option>
                <option value="GENERAL_COMPETENCE">General Competence</option>
              </select>
            </div>
            <div class="col-12">
              <label class="form-label">Text</label>
              <textarea class="form-control" rows="4" bind:value={poForm.text}></textarea>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" on:click={() => (showProgramOutcomeModal = false)}>Cancel</button>
          <button class="btn btn-primary" on:click={saveProgramOutcome}>Save</button>
        </div>
      </div>
    </div>
  </div>
  <div class="modal-backdrop fade show"></div>
{/if}
