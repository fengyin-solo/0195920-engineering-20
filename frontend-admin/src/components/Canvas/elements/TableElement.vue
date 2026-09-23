<template>
  <div class="table-element" :style="tableStyle">
    <table :style="innerTableStyle">
      <tr v-for="rowIdx in element.rows" :key="rowIdx">
        <td
          v-for="colIdx in element.cols"
          :key="colIdx"
          :style="cellStyle"
          @dblclick.stop="startEdit(rowIdx - 1, colIdx - 1)"
        >
          <span v-if="!isEditing || editingRow !== rowIdx - 1 || editingCol !== colIdx - 1">
            {{ getCellText(rowIdx - 1, colIdx - 1) }}
          </span>
          <input
            v-else
            ref="editInputRef"
            v-model="editText"
            class="cell-input"
            :style="cellInputStyle"
            @blur="finishEdit"
            @keydown.enter="finishEdit"
            @keydown.esc="cancelEdit"
            @mousedown.stop
            @click.stop
          />
        </td>
      </tr>
    </table>
  </div>
</template>

<script setup>
import { ref, computed, nextTick } from 'vue'
import { useCanvasStore } from '@/stores/canvas'

const props = defineProps({ element: { type: Object, required: true } })
const store = useCanvasStore()

const isEditing = ref(false)
const editingRow = ref(-1)
const editingCol = ref(-1)
const editText = ref('')
const editInputRef = ref(null)

const rows = computed(() => props.element.rows || 3)

const tableStyle = computed(() => ({
  width: '100%',
  height: '100%',
  overflow: 'hidden'
}))

const innerTableStyle = computed(() => /** @type {import('vue').CSSProperties} */ ({
  width: '100%',
  height: '100%',
  borderCollapse: 'collapse',
  tableLayout: 'fixed',
  border: `${props.element.borderWidth || 1}px solid ${props.element.borderColor || '#000000'}`
}))

const cellStyle = computed(() => /** @type {import('vue').CSSProperties} */ ({
  border: `${props.element.borderWidth || 1}px solid ${props.element.borderColor || '#000000'}`,
  padding: '2px 4px',
  fontSize: `${props.element.cellFontSize || 12}px`,
  fontFamily: props.element.cellFontFamily || 'Arial',
  color: props.element.cellFontColor || '#000000',
  textAlign: props.element.cellTextAlign || 'center',
  verticalAlign: 'middle',
  overflow: 'hidden',
  whiteSpace: 'nowrap',
  textOverflow: 'ellipsis',
  wordBreak: 'break-all'
}))

const cellInputStyle = computed(() => ({
  fontSize: `${props.element.cellFontSize || 12}px`,
  fontFamily: props.element.cellFontFamily || 'Arial',
  color: props.element.cellFontColor || '#000000',
  textAlign: props.element.cellTextAlign || 'center'
}))

const getCellText = (row, col) => {
  const cells = props.element.cells
  if (cells && cells[row] && cells[row][col] !== undefined) {
    return cells[row][col]
  }
  return ''
}

const startEdit = async (row, col) => {
  isEditing.value = true
  editingRow.value = row
  editingCol.value = col
  editText.value = getCellText(row, col)
  await nextTick()
  if (editInputRef.value) {
    const input = Array.isArray(editInputRef.value) ? editInputRef.value[0] : editInputRef.value
    if (input) {
      input.focus()
      input.select()
    }
  }
}

const finishEdit = () => {
  if (!isEditing.value) return
  const cells = {}
  const oldCells = props.element.cells || {}
  for (let r = 0; r < rows.value; r++) {
    cells[r] = oldCells[r] ? { ...oldCells[r] } : {}
  }
  const oldValue = getCellText(editingRow.value, editingCol.value)
  cells[editingRow.value][editingCol.value] = editText.value
  if (editText.value !== oldValue) {
    store.updateElement(props.element.id, { cells })
  }
  isEditing.value = false
  editingRow.value = -1
  editingCol.value = -1
}

const cancelEdit = () => {
  isEditing.value = false
  editingRow.value = -1
  editingCol.value = -1
}

defineExpose({ startEdit })
</script>

<style scoped>
.table-element {
  user-select: none;
}

.table-element table {
  user-select: none;
}

.table-element td {
  user-select: none;
}

.cell-input {
  width: 100%;
  height: 100%;
  border: none;
  outline: none;
  background: rgba(255, 255, 255, 0.9);
  padding: 0 2px;
  box-sizing: border-box;
}
</style>
