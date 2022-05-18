import dynalistService = require('./dynalist-service');
import * as config from './config.json';
import {DynalistApi} from 'dynalist-api';
const api = new DynalistApi(config.dynalistApiKey);

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
    await api.uncheckNodes(checkedGrandchildren, documentId);
    await api.moveNodes(checkedGrandchildren, documentId, inventoryUncategorizedNode.id);
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
    await api.uncheckNodes(restockItems, documentId);
    await api.moveNodes(restockItems, documentId, shoppingUncategorizedNode.id);
    await api.deleteNodes(documentId, deleteItems);//todo consistent ordering
};

export const updateInventory = async () => {
    await moveCheckedShoppingListItemsToInventory();
    await moveCheckedInventoryItemsToShoppingList();
}