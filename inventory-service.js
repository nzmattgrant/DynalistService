const dynalistService = require('./dynalist-service');
const config = require('./config.json');

const inventoryHashTag = "#inventory";
const shoppingListHashTag = "#shopping-list";
const uncategorizedHashTag = "#uncategorized";
const restockHashTag = "#restock"


const  moveCheckedShoppingListItemsToInventory = async () => {
    const documentId = config.dynalistSharedDocumentId;
    const document = await dynalistService.getDocument(documentId);
    const nodes = document.nodes;
    const shoppingNode = nodes.find(node => node.content.includes(shoppingListHashTag));
    const shoppingNodeChildrenItems = nodes.filter(node => shoppingNode.children.includes(node.id));
    const inventoryNode = nodes.find(node => node.content.includes(inventoryHashTag));
    const inventoryNodeChildrenItems = nodes.filter(node => inventoryNode.children.includes(node.id));
    const inventoryUncategorizedNode = inventoryNodeChildrenItems.find(node => node.content.includes(uncategorizedHashTag));
    var shoppingNodeGrandchildrenIds = [];
    shoppingNodeChildrenItems.forEach(child => {
        shoppingNodeGrandchildrenIds = shoppingNodeGrandchildrenIds.concat(child.children);
    });
    const checkedGrandchildren = nodes.filter(node => node.checked && shoppingNodeGrandchildrenIds.includes(node.id));
    await dynalistService.uncheckNodes(checkedGrandchildren, documentId);
    await dynalistService.moveNodes(checkedGrandchildren, inventoryUncategorizedNode.id, documentId);
};

const moveCheckedInventoryItemsToShoppingList = async () => {
    const documentId = config.dynalistSharedDocumentId;
    const document = await dynalistService.getDocument(documentId);
    const nodes = document.nodes;
    const inventoryNode = nodes.find(node => node.content.includes(inventoryHashTag));
    const inventoryNodeChildrenItems = nodes.filter(node => inventoryNode.children.includes(node.id));
    const shoppingNode = nodes.find(node => node.content.includes(shoppingListHashTag));
    const shoppingNodeChildrenItems = nodes.filter(node => shoppingNode.children.includes(node.id));
    const shoppingUncategorizedNode = shoppingNodeChildrenItems.find(node => node.content.includes(uncategorizedHashTag));
    var inventoryNodeGrandchildrenIds = [];
    inventoryNodeChildrenItems.forEach(child => {
        inventoryNodeGrandchildrenIds = inventoryNodeGrandchildrenIds.concat(child.children);
    });
    const checkedGrandchildren = nodes.filter(node => node.checked && inventoryNodeGrandchildrenIds.includes(node.id));
    const restockItems = checkedGrandchildren.filter(node => node.content.includes(restockHashTag));
    const deleteItems = checkedGrandchildren.filter(node => !node.content.includes(restockHashTag));
    await dynalistService.uncheckNodes(restockItems, documentId);
    await dynalistService.moveNodes(restockItems, shoppingUncategorizedNode.id, documentId);
    await dynalistService.deleteNodes(documentId, deleteItems);//todo consistent ordering
};

const updateInventory = async () => {
    await moveCheckedShoppingListItemsToInventory();
    await moveCheckedInventoryItemsToShoppingList();
}

const InventoryService = {
    updateInventory: updateInventory,
}

module.exports = InventoryService