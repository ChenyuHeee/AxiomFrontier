import json
from typing import Dict, List, Set

class ConnectivityMap:
    """
    Generates a connectivity map of rooms and zones based on neighbor relationships and city IDs.
    """
    
    def __init__(self):
        self.rooms: Dict[str, Dict] = {}
        self.zones: Dict[str, Set[str]] = {}
        self.city_connections: Dict[str, Set[str]] = {}
    
    def add_room(self, room_id: str, city_id: str, neighbors: List[str]):
        """Add a room with its city and neighbor rooms."""
        self.rooms[room_id] = {
            'city_id': city_id,
            'neighbors': set(neighbors)
        }
        if city_id not in self.zones:
            self.zones[city_id] = set()
        self.zones[city_id].add(room_id)
        
        # Update city connections based on neighbors
        for neighbor in neighbors:
            if neighbor in self.rooms:
                neighbor_city = self.rooms[neighbor]['city_id']
                if city_id != neighbor_city:
                    if city_id not in self.city_connections:
                        self.city_connections[city_id] = set()
                    if neighbor_city not in self.city_connections:
                        self.city_connections[neighbor_city] = set()
                    self.city_connections[city_id].add(neighbor_city)
                    self.city_connections[neighbor_city].add(city_id)
    
    def get_room_connectivity(self, room_id: str) -> Dict:
        """Return connectivity info for a specific room."""
        if room_id not in self.rooms:
            return {}
        room = self.rooms[room_id]
        return {
            'room_id': room_id,
            'city_id': room['city_id'],
            'neighbors': list(room['neighbors']),
            'zone_rooms': list(self.zones.get(room['city_id'], set()))
        }
    
    def get_city_connectivity(self, city_id: str) -> Dict:
        """Return connectivity info for a specific city zone."""
        return {
            'city_id': city_id,
            'rooms': list(self.zones.get(city_id, set())),
            'connected_cities': list(self.city_connections.get(city_id, set()))
        }
    
    def generate_map(self) -> Dict:
        """Generate the complete connectivity map."""
        return {
            'rooms': {rid: {
                'city_id': data['city_id'],
                'neighbors': list(data['neighbors'])
            } for rid, data in self.rooms.items()},
            'zones': {cid: list(rooms) for cid, rooms in self.zones.items()},
            'city_connections': {cid: list(conn) for cid, conn in self.city_connections.items()}
        }
    
    def save_to_file(self, filename: str):
        """Save the connectivity map to a JSON file."""
        with open(filename, 'w') as f:
            json.dump(self.generate_map(), f, indent=2)
    
    def load_from_file(self, filename: str):
        """Load a connectivity map from a JSON file."""
        with open(filename, 'r') as f:
            data = json.load(f)
        
        self.rooms = {}
        self.zones = {}
        self.city_connections = {}
        
        # Reconstruct the map
        for room_id, room_data in data['rooms'].items():
            self.add_room(room_id, room_data['city_id'], room_data['neighbors'])

# Example usage
def example():
    cm = ConnectivityMap()
    cm.add_room('room1', 'cityA', ['room2', 'room3'])
    cm.add_room('room2', 'cityA', ['room1', 'room4'])
    cm.add_room('room3', 'cityB', ['room1', 'room5'])
    cm.add_room('room4', 'cityA', ['room2'])
    cm.add_room('room5', 'cityB', ['room3'])
    
    print("Room connectivity for room1:", cm.get_room_connectivity('room1'))
    print("City connectivity for cityA:", cm.get_city_connectivity('cityA'))
    print("Full map:", json.dumps(cm.generate_map(), indent=2))
    
    cm.save_to_file('connectivity_map.json')

if __name__ == '__main__':
    example()