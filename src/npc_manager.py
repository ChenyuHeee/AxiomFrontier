import json

class NPCManager:
    def __init__(self, npc_data_file='data/npcs.json'):
        self.npc_data_file = npc_data_file
        self.npcs = self.load_npcs()
    
    def load_npcs(self):
        try:
            with open(self.npc_data_file, 'r') as f:
                return json.load(f)
        except FileNotFoundError:
            return []
    
    def check_for_npcs(self, location):
        npcs_in_location = [npc for npc in self.npcs if npc.get('location') == location]
        return npcs_in_location
    
    def handle_npc_tasks(self, npc_id, task_type, **kwargs):
        npc = next((npc for npc in self.npcs if npc.get('id') == npc_id), None)
        if not npc:
            return {'error': 'NPC not found'}
        
        if task_type == 'dialogue':
            return self.handle_dialogue(npc, **kwargs)
        elif task_type == 'quest':
            return self.handle_quest(npc, **kwargs)
        elif task_type == 'trade':
            return self.handle_trade(npc, **kwargs)
        else:
            return {'error': 'Unknown task type'}
    
    def handle_dialogue(self, npc, dialogue_key='default'):
        dialogues = npc.get('dialogues', {})
        return dialogues.get(dialogue_key, 'No dialogue available.')
    
    def handle_quest(self, npc, quest_id=None):
        quests = npc.get('quests', [])
        if quest_id:
            quest = next((q for q in quests if q.get('id') == quest_id), None)
            return quest if quest else {'error': 'Quest not found'}
        return quests
    
    def handle_trade(self, npc, item_id=None):
        inventory = npc.get('inventory', [])
        if item_id:
            item = next((i for i in inventory if i.get('id') == item_id), None)
            return item if item else {'error': 'Item not found'}
        return inventory
    
    def update_npc(self, npc_id, updates):
        for npc in self.npcs:
            if npc.get('id') == npc_id:
                npc.update(updates)
                self.save_npcs()
                return {'success': True}
        return {'error': 'NPC not found'}
    
    def save_npcs(self):
        with open(self.npc_data_file, 'w') as f:
            json.dump(self.npcs, f, indent=2)