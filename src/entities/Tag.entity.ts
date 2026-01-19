/**
 * Tag.entity.ts
 *
 * TypeORM Entity for Tag table.
 * This entity maps to the tags table in the database.
 */
import { Entity, PrimaryColumn, Column, ManyToMany, JoinTable } from 'typeorm';
import { Todo } from './Todo.entity.js';

@Entity('tags')
export class Tag {
  @PrimaryColumn({ type: 'text' })
  id!: string;

  @Column({ type: 'text', unique: true })
  name!: string;

  @Column({ type: 'text', nullable: true })
  color!: string | null;

  @Column({ type: 'text' })
  createdAt!: string;

  @Column({ type: 'text' })
  updatedAt!: string;

  // Relationships
  @ManyToMany(() => Todo, todo => todo.tags)
  @JoinTable({
    name: 'todo_tags',
    joinColumn: { name: 'tag_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'todo_id', referencedColumnName: 'id' }
  })
  todos!: Todo[];
}
