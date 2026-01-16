/**
 * IdMapService.ts
 * 
 * This service provides a stateless mapping between human-readable IDs and UUIDs.
 * It maintains separate maps for different entity types (todos, tags, etc) while
 * sharing the same underlying logic.
 * 
 * WHY ABSTRACT THIS LOGIC?
 * - Avoids duplication across multiple services
 * - Provides a consistent interface for ID mapping across the application
 * - Makes it easy to add new entity types that need human-readable IDs
 * - Centralizes the mapping logic in one place
 */

/**
 * EntityType enum
 * 
 * Defines the types of entities that use human-readable ID mappings.
 */
export enum EntityType {
  TODO = "TASK",
  TAG = "TAG",
}

/**
 * IdMapService Class
 * 
 * Manages bidirectional mapping between UUIDs and human-readable IDs.
 * Uses separate internal maps for each entity type.
 */
class IdMapService {
  // Maps for different entity types
  private todoMap: Map<string, string>;   // Maps task-* to UUID
  private tagMap: Map<string, string>;    // Maps tag-* to UUID
  private todoUuidMap: Map<string, string>; // Maps UUID to task-*
  private tagUuidMap: Map<string, string>;  // Maps UUID to tag-*

  constructor() {
    this.todoMap = new Map();
    this.tagMap = new Map();
    this.todoUuidMap = new Map();
    this.tagUuidMap = new Map();
  }

  /**
   * Get the human-readable ID for a UUID
   * 
   * This creates a mapping if it doesn't exist yet.
   * Format: type-N where N is the map size
   * 
   * @param uuid The UUID to map
   * @param entityType The type of entity
   * @returns The human-readable ID (e.g., task-1, tag-5)
   */
  getHumanReadableId(uuid: string, entityType: EntityType): string {
    // Check if we already have a mapping for this UUID
    const uuidMap = entityType === EntityType.TODO ? this.todoUuidMap : this.tagUuidMap;
    const existingId = uuidMap.get(uuid);
    if (existingId) {
      return existingId;
    }

    // Create a new mapping
    const idMap = entityType === EntityType.TODO ? this.todoMap : this.tagMap;
    const prefix = entityType === EntityType.TODO ? "task" : "tag";
    const newId = `${prefix}-${idMap.size + 1}`;
    
    // Store bidirectional mapping
    idMap.set(newId, uuid);
    uuidMap.set(uuid, newId);
    
    return newId;
  }

  /**
   * Get the UUID for a human-readable ID
   * 
   * @param humanReadableId The human-readable ID (e.g., task-1, tag-5)
   * @param entityType The type of entity
   * @returns The UUID, or undefined if not found
   */
  getUuid(humanReadableId: string, entityType: EntityType): string | undefined {
    const idMap = entityType === EntityType.TODO ? this.todoMap : this.tagMap;
    return idMap.get(humanReadableId);
  }

  /**
   * Register a new mapping
   * 
   * Used when loading existing entities from the database to rebuild the maps.
   * 
   * @param humanReadableId The human-readable ID
   * @param uuid The UUID
   * @param entityType The type of entity
   */
  registerMapping(humanReadableId: string, uuid: string, entityType: EntityType): void {
    const idMap = entityType === EntityType.TODO ? this.todoMap : this.tagMap;
    const uuidMap = entityType === EntityType.TODO ? this.todoUuidMap : this.tagUuidMap;
    
    idMap.set(humanReadableId, uuid);
    uuidMap.set(uuid, humanReadableId);
  }

  /**
   * Unregister a mapping
   * 
   * Used when deleting entities to clean up the maps.
   * 
   * @param humanReadableId The human-readable ID
   * @param uuid The UUID
   * @param entityType The type of entity
   */
  unregisterMapping(humanReadableId: string, uuid: string, entityType: EntityType): void {
    const idMap = entityType === EntityType.TODO ? this.todoMap : this.tagMap;
    const uuidMap = entityType === EntityType.TODO ? this.todoUuidMap : this.tagUuidMap;
    
    idMap.delete(humanReadableId);
    uuidMap.delete(uuid);
  }

  /**
   * Get the next expected ID for an entity type
   * 
   * Useful for displaying what the next ID will be.
   * 
   * @param entityType The type of entity
   * @returns The next ID that would be assigned
   */
  getNextId(entityType: EntityType): string {
    const idMap = entityType === EntityType.TODO ? this.todoMap : this.tagMap;
    const prefix = entityType === EntityType.TODO ? "task" : "tag";
    return `${prefix}-${idMap.size + 1}`;
  }

  /**
   * Get all mappings for an entity type
   * 
   * Useful for debugging or introspection.
   * 
   * @param entityType The type of entity
   * @returns Array of [humanReadableId, uuid] tuples
   */
  getAllMappings(entityType: EntityType): Array<[string, string]> {
    const idMap = entityType === EntityType.TODO ? this.todoMap : this.tagMap;
    return Array.from(idMap.entries());
  }
}

// Create a singleton instance for use throughout the application
export const idMapService = new IdMapService();
